/* logd is a modification of etsy's statsd that also records log messages.
 * logd stats and messages are sent via a simple protocol that's encoded using
 * msgpack.
 */

var dgram   = require("dgram")
  , sys     = require("sys")
  , net     = require("net")
  , msgpack = require("msgpack")
  , config  = require("./config")
  , async   = require("async")
  , store   = require("./logstore");

/* enums for message types */

var types = Object.freeze({
  LOG: 1,
  COUNTER: 2,
  TIMER: 3,
  DELETE_LOG: 4,
  METER: 5,
});

var messagesReceived = 0;
var messagesReceivedPrev = 0;
var logMessages = {};
var counters = {};
var timers = {};
var meters = {};

var debugInt, flushInt, logInt, trimInt, statsInt, server;

/* Delete a log and all support data for a given log on a path. */
function deleteLog(redisClient, config, path) {

}

/* send stats to graphite */

function sendStats(config, stats) {
  var port = Number(config.graphite.port || 2003)
    , host = config.graphite.host || 'localhost';

  try {
    var graphite = net.createConnection(port, host);
    graphite.addListener('error', function(connectionException){
      if (config.debug) {
        sys.log(connectionException);
      }
    });
    graphite.on('connect', function() {
      this.write(stats);
      this.end();
    });
  } catch(e) {
    if (config.debug) {
      sys.log(e);
    }
  }
}

/* read the config file and run the server */
config.configFile(process.argv[2], function (config, oldConfig) {
  if (!config.debug && debugInt) {
    clearInterval(debugInt); 
    debugInt = false;
  }

  if (config.debug) {
    if (debugInt) { 
      clearInterval(debugInt); 
    }
    debugInt = setInterval(function () {
      sys.log("counters: " + sys.inspect(counters));
      sys.log("timers: " + sys.inspect(timers));
    }, config.debugInterval || 10000);
  }

  if (typeof config.logSize === 'undefined') {
    config.logSize = {'default': 100000};
  }

  if (typeof config.redis === 'undefined') {
    sys.log("no redis config, using defaults.");
    config.redis = {};
  }
  
  if (typeof config.graphite === 'undefined') {
    sys.log("no graphite config, using defaults.");
    config.graphite = {};
  }

  var redisClient = redisConnect(config);

  if (server === undefined) {
    var port = Number(config.port || 8126);
    /* listen on a datagram socket and add messages to local data structures to
     * be flushed out at a configurable interval.
     */
    server = dgram.createSocket('udp4', function (msg, rinfo) {
      var blob = msgpack.unpack(msg);
      if (!blob) { 
        sys.log("Error with message " + msg);
        return; 
      }
      if (config.debug) { 
        sys.log(sys.inspect(msg)); 
      }

      switch (blob.id) {
        case types.LOG:
          /* TODO: do we care about this? this doubles the amt of
           * msgpack/unpack we have to do, but it allows us to always know
           * which ip sent us some information
           */
          messagesReceived++;
          blob.ip = rinfo.address;
          if (! logMessages[blob.path]) {
            logMessages[blob.path] = [];
          }
          logMessages[blob.path].push(blob);
          break;
        case types.COUNTER:
          /* statsd like counter */
          var sampleRate = blob.rate || 1;
          if (! counters[blob.key]) {
            counters[blob.key] = 0;
          }
          counters[blob.key] += Number((blob.value || 1) * (1 / sampleRate));
          break;
        case types.TIMER:
          /* statsd like timer */
          if (! timers[blob.key]) {
            timers[blob.key] = [];
          }
          timers[blob.key].push(blob.value);
          break;
        case types.DELETE_LOG:
          deleteLog(redisClient, blob.path);
          break;
        case types.METER:
          /* note that because of the nature of meters, although a sample rate
           * is a valid thing to send along with it, we don't need to know what
           * it was;  we're taking a mean over the values we receive, not based
           * on the number of received readings over a time period.
           */
          if (!meters[blob.key]) {
            meters[blob.key] = {count: 0, total: 0};
          }
          meters[blob.key].count++;
          meters[blob.key].total += blob.value;
          break;
        default: 
          break;
      }
    });
    
    server.on("listening", function() {
      sys.log("logd listening on port " + port);
    });

    server.bind(port);
  }
    
  /* every second, print if we've received messages or not */
  var logInterval = Number(config.logInterval || 1000);

  logInt = setInterval(function() {
    if (messagesReceived !== messagesReceivedPrev) {
      dmsg = messagesReceived - messagesReceivedPrev;
      messagesReceivedPrev = messagesReceived;
      sys.log("Received " + dmsg + " messages in 1s (" + messagesReceived + " total).");
    }
  }, logInterval);

  /* every second, flush local stats & messages to redis */
  var flushInterval = Number(config.flushInterval || 1000);

  flushInt = setInterval(function() {
    /* flush log messages */
    var messages, logger, size, msg;
    var allsize = Number(config.logSize.all || 250000);
    var logd = config.redis.prefix || 'logd';
    var path;

    for (path in logMessages) {
      if (!logMessages[path] || !logMessages[path].length) {
        continue;
      }

      var base = logd + ':log:' + path;

      /* ids for these messages are simple monotonically increasing integers.
       * fetch the value for the next id from the database and add the cached
       * messages.
       */
      redisClient.get(base + ':next', function(base, path) {
          return function(err, next) {
            var messages = logMessages[path];
            var count = 0;
            var multi = redisClient.multi();
            next = Number(next);

            /* if there was no "next" setting, then this logger didn't exist yet.
             * add it to the list of paths and give it a next val
             */
            if (!next) {
              next = 1;
              redisClient.multi()
                .sadd('logd:paths', path)
                .set(base + ':next', next)
                .exec();
            }

            /* add the messages to the path's lists & ordered sets */
            for( ; count < messages.length; count++, next++) {
              msg = messages[count];
              msg.id = next;
              //  https://github.com/mranney/node_redis/pull/119
              //  fixed in 0.6.5
              var packed = msgpack.pack(msg);
              //var bufpacked = new Buffer(packed.length);
              //packed.copy(bufpacked)
              multi
                .set(base + ':' + next, packed)
                .lpush(base, next)
                .zadd(base + ':level:' + msg.level, -msg.time, next)
                .zadd(base + ':name:' + msg.name, -msg.time, next)
                .sadd(base + ':names', msg.name);
            }

            /* clear local cache, increment the in-redis next val, and flush */
            /*
            if (!count) {
              debugger;
            }
            */
            multi.incrby(base + ':next', count);
            multi.exec(redisErrback);
            logMessages[path] = [];
          };
        }(base, path)
      );
    }

  }, flushInterval);

  var trimInterval = Number(config.trimInterval || 10000);

  trimInt = setInterval(function() {
    trimLogs(redisClient, config);
  }, trimInterval)
  

  /* Every 10 seconds, flush stats to graphite.  This code is exactly
   * the same as the statsd code, as even the local storage is identical.
   */
  var statsInterval = Number(config.statsInterval || 10000);

  statsInt = setInterval(function() {
    var statString = '';
    var ts = Math.round(new Date().getTime() / 1000);
    var numStats = 0;
    var key;

    /* counters generally increment monotonically over a period of time, and
     * are useful for counting the number of events of a given type that are
     * happening each second.  The mean is taken over the course of the
     * interval to be charted, with the counter getting the full value (ie
     * the total number of events over the interval).
     */
    for (key in counters) {
      var value = counters[key] / (flushInterval / 1000);
      var message = 'stats.' + key + ' ' + value + ' ' + ts + "\n";
      message += 'stats.counts.' + key + ' ' + counters[key] + ' ' + ts + "\n";
      statString += message;
      counters[key] = 0;

      numStats += 1;
    }

    /* meters are statistics which record the given level of some value over
     * time.  They are different from counters in that they are not designed
     * for counting events but for keeping track of particular values, such
     * as the size of a queue or the number of available resources.
     */

    for (key in meters) {
      var value;
      /* unlike the counters, take the mean of the meter values over the period
       * based on the number of readings rather than the number of seconds
       */
      if (!meters[key].count) {
        value = 0;
      } else {
        value = meters[key].total / meters[key].count;
      }
      var message =  'stats.meters.' + key + ' ' + value + ' ' + ts + "\n";
      message += 'stats.mcounts.' + key + ' ' + meters[key].count + ' ' + ts + "\n";
      statString += message;

      meters[key].count = 0;
      meters[key].total = 0;

      numStats += 1;
    }

    /* timers are specifically for storing duration data for certain critical
     * sections or operations.  They are stored in graphite with some
     * additional pre-calculated statistical values like mean, percentiles, etc
     */

    for (key in timers) {
      if (timers[key].length > 0) {
        var pctThreshold = config.percentThreshold || 90;
        var values = timers[key].sort(function (a,b) { return a-b; });
        var count = values.length;
        var min = values[0];
        var max = values[count - 1];

        var mean = min;
        var maxAtThreshold = max;

        if (count > 1) {
          var thresholdIndex = Math.round(((100 - pctThreshold) / 100) * count);
          var numInThreshold = count - thresholdIndex;
          values = values.slice(0, numInThreshold);
          maxAtThreshold = values[numInThreshold - 1];

          // average the remaining timings
          var sum = 0;
          for (var i = 0; i < numInThreshold; i++) {
            sum += values[i];
          }

          mean = sum / numInThreshold;
        }

        timers[key] = [];

        var message = "";
        message += 'stats.timers.' + key + '.mean ' + mean + ' ' + ts + "\n";
        message += 'stats.timers.' + key + '.upper ' + max + ' ' + ts + "\n";
        message += 'stats.timers.' + key + '.upper_' + pctThreshold + ' ' + maxAtThreshold + ' ' + ts + "\n";
        message += 'stats.timers.' + key + '.lower ' + min + ' ' + ts + "\n";
        message += 'stats.timers.' + key + '.count ' + count + ' ' + ts + "\n";
        statString += message;

        numStats += 1;
      }
    }

    statString += 'stats.numStats ' + numStats + ' ' + ts + "\n";
    if (numStats) {
      if (config.debug) {
        sys.log("Sending stats string: \n" + statString);
      }
      sendStats(config, statString);
    }

  }, statsInterval);

});


