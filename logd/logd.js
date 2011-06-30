var dgram  = require('dgram')
  , sys    = require('sys')
  , net    = require('net')
  , msgpack = require('msgpack')
  , config = require('./config')
  , redis  = require('redis')

var types = Object.freeze({
  LOG: 1,
  COUNTER: 2,
  TIMER: 3,
});

var messagesReceived = 0;
var messagesReceivedPrev = 0;
var logMessages = [];
var counters = {};
var timers = {};
var debugInt, flushInt, logInt, server;

/* Connect to redis, using the configuration options provided, falling
 * back on sane defaults.  Sets a few message handlers to deal with errors
 * and report the status of the connection.
 */

function redisConnect(config) {
  var port = config.redisPort || 6379,
      host = config.redisHost || "localhost",
      options = config.redisOptions || {};

  var client = redis.createClient(port, host, options);

  client.on("error", function(err) {
    sys.log("Redis error: " + err.message);
    /* if this was connection refused, lets exit */
    if (err.message.match(/ECONNREFUSED/)) {
      process.exit(-1);
    }
  });

  client.on("connect", function() {
    sys.log("connected to Redis server on " +
      (config.redisHost || 'localhost') + ":" +
      Number(config.redisPort || 6379));
  });

  return client;
}

/* read the config file and run the server */
config.configFile(process.argv[2], function (config, oldConfig) {
  if (! config.debug && debugInt) {
    clearInterval(debugInt); 
    debugInt = false;
  }

  if (config.debug) {
    if (debugInt !== undefined) { clearInterval(debugInt); }
    debugInt = setInterval(function () { 
      sys.log("Counters:\n" + sys.inspect(counters) + "\nTimers:\n" + sys.inspect(timers));
    }, config.debugInterval || 10000);
  }

  var redisClient = redisConnect(config);

  if (server === undefined) {
    var port = Number(config.port || 8126);

    server = dgram.createSocket('udp4', function (msg, rinfo) {
      if (config.dumpMessages) { sys.log(msg.toString()); }
      var blob = msgpack.unpack(msg);
      messagesReceived++;
      
      switch (blob.type) {
        case types.LOG:
          blob.packed = msg;
          if (! logMessages[blob.key]) {
            logMessages[blob.key] = [];
          }
          logMessages[blob.key].push(blob);
          break;
        case types.COUNTER:
          /* statsd like counter */
          var sampleRate = blob.rate || 1;
          if (! counters[blob.key]) {
            counters[blob.key] = 0;
          }
          counters[blob.key] = blob.value * (1 / sampleRate);
          break;
        case types.TIMER:
          /* statsd like timer */
          if (! timers[blob.key]) {
            timers[blob.key] = [];
          }
          timers[blob.key].push(blob.value);
        default: break;
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
    if (messagesReceived != messagesReceivedPrev) {
      dmsg = messagesReceived - messagesReceivedPrev;
      messagesReceivedPrev = messagesReceived;
      sys.log("Received " + dmsg + " messages in 1s (" + messagesReceived + " total).");
    }
  }, logInterval);

  /* every second, flush local stats & messages to redis */
  var flushInterval = Number(config.flushInterval || 1000);

  flushInt = setInterval(function() {
    /* flush log messages */
    var messages, logger, size;

    multi = redisClient.multi();

    for (logger in logMessages) {
      size = Number(config.loggerSize[logger] || config.loggerSize['default']);
      messages = logMessages[logger];
      if (messages.length) {
        for(var i=0; i<messages.length; i++) {
          multi.lpush(logger, messages[i].packed);
        }
        multi.ltrim(logger, 0, size);
        logMessages[logger] = [];
      }
    }
    multi.exec(function(err, replies) {
      if (replies.length) {
        sys.log("flushed " + replies[0] + " log records to redis.");
      }
      if (err) {
        sys.log("redis error: " + err);
      }
    });

    /* TODO: flush counters */
    /* TODO: flush timers */

  }, flushInterval);
    /*
    var flushInterval = Number(config.flushInterval || 10000);

    flushInt = setInterval(function () {
      var statString = '';
      var ts = Math.round(new Date().getTime() / 1000);
      var numStats = 0;
      var key;

      
      for (key in counters) {
        var value = counters[key] / (flushInterval / 1000);
        var message = 'stats.' + key + ' ' + value + ' ' + ts + "\n";
        message += 'stats_counts.' + key + ' ' + counters[key] + ' ' + ts + "\n";
        statString += message;
        counters[key] = 0;

        numStats += 1;
      }

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

      statString += 'statsd.numStats ' + numStats + ' ' + ts + "\n";
      
      try {
        var graphite = net.createConnection(config.graphitePort, config.graphiteHost);
        graphite.addListener('error', function(connectionException){
          if (config.debug) {
            sys.log(connectionException);
          }
        });
        graphite.on('connect', function() {
          this.write(statString);
          this.end();
        });
      } catch(e){
        if (config.debug) {
          sys.log(e);
        }
      }

    }, flushInterval);
  }
  */
});


