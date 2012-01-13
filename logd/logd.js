/* logd is a modification of etsy's statsd that also records log messages.
 * logd stats and messages are sent via a simple protocol that's encoded using
 * msgpack.
 */

var dgram   = require("dgram")
  , util    = require("util")
  , net     = require("net")
  , msgpack = require("msgpack2")
  , async   = require("async")
  , config  = require("./config")
  , color   = require("./colored")
  , Store   = require("./logstore").Store;

/* enums for message types */

var types = Object.freeze({
  LOG: 1,
  COUNTER: 2,
  TIMER: 3,
  METER: 4,
  DELETE_LOG: 1000,
});

var logsReceived = 0;
var logsReceivedPrev = 0;
var logMessages = {};
var counters = {};
var timers = {};
var meters = {};

var debugInt, flushInt, logInt, statsInt, server;

/* Delete a log and all support data for a given log on a path. */
function deleteLog(store, path) {
  store.deleteLog(path, function() {
     util.log("Log file " + path + " deleted."); 
  });
}

/* send stats to graphite */
function sendStats(config, stats) {
  var port = Number(config.graphite.port || 2003)
    , host = config.graphite.host || 'localhost';

  try {
    var graphite = net.createConnection(port, host);
    graphite.addListener('error', function(connectionException){
      if (config.debug) {
        util.log(connectionException);
      }
    });
    graphite.on('connect', function() {
      this.write(stats);
      this.end();
    });
  } catch(e) {
    if (config.debug) {
      util.log(e);
    }
  }
}

/* clean a configuration so it has at least empty objects where
 * we expect them and some sane defaults for the logstore.
 */
function cleanConfig(config) {

  /* by default, turn debug off */
  if (typeof(config.debug) === "undefined") {
    config.debug = false;
  }

  config.debugInterval = Number(config.debugInterval) || 10000;
  config.flushInterval = Number(config.flushInterval) || 1000;
  config.statsInterval = Number(config.statsInterval) || 10000;
  config.logInterval = Number(config.logInterval) || 1000;
  config.updateInterval = (1000 * 90);

  config.percentThreshold = Number(config.percentThreshold) || 90;

  config.logs = config.logs || ({
    'default': { 
      size: 26144000,
      max: 1000000
    }
  });

  if (typeof(config.mongo) === "undefined") {
    util.log(color.orange("Warning:") + " no mongo config, using defaults.");
    config.mongo = {};
  }

  if (typeof(config.graphite) === "undefined") {
    util.log(color.orange("Warning:") + " no graphite config, using defaults.");
    config.graphite = {};
  }

  return config;
}


/* read the config file and run the server */
config.configFile(process.argv[2], function (config, oldConfig) {
  
  config = cleanConfig(config);

  /* on a reload, if we've turned debug off, turn it off and clear interval */
  if (!config.debug && debugInt) {
    clearInterval(debugInt); 
    debugInt = false;
  }

  if (config.debug) {
    if (debugInt) { clearInterval(debugInt); }
    debugInt = setInterval(function () {
      util.log("counters: " + util.inspect(counters));
      util.log("timers: " + util.inspect(timers));
    }, config.debugInterval);
  }

  var store = new Store(config);

  if (server === undefined) {
    var port = Number(config.port || 8126);
    /* listen on a datagram socket and add messages to local data structures to
     * be flushed out at a configurable interval.
     */
    server = dgram.createSocket('udp4', function (msg, rinfo) {
      var blob = msgpack.unpack(msg);
      if (!blob) { 
        util.log("Error with message " + msg);
        return; 
      }
      if (config.debug) { 
        util.log(util.inspect(msg)); 
      }

      switch (blob.id) {
        case types.LOG:
          /* TODO: do we care about this? this doubles the amt of
           * msgpack/unpack we have to do, but it allows us to always know
           * which ip sent us some information
           */
          var path = blob.path;
          logsReceived++;
          blob.ip = rinfo.address;
          if (! logMessages[blob.path]) {
            logMessages[blob.path] = [];
          }
          delete blob.id;
          delete blob.path;
          logMessages[path].push(blob);

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
          var sampleRate = blob.rate || 1;
          if (typeof(timers[blob.key]) == "undefined" || typeof(timers[blob.key].times) == "undefined") {
            timers[blob.key] = {times: [], rates: []};
          }
          timers[blob.key].times.push(blob.value);
          timers[blob.key].rates.push(sampleRate);
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
        case types.DELETE_LOG:
          deleteLog(store, blob.path);
          break;
        default: 
          break;
      }
    });
    
    server.on("listening", function() {
      util.log("logd listening on port " + port);
    });

    server.bind(port);
  }
    
  /* every logInterval (default: 1s), print if we've received messages or not */

  logInt = setInterval(function() {
    if (logsReceived !== logsReceivedPrev) {
      dmsg = logsReceived - logsReceivedPrev;
      logsReceivedPrev = logsReceived;
      interval = Number(config.logInterval / 1000)
      util.log("Received " + dmsg + " messages in " + interval + "s (" + logsReceived + " total).");
    }
  }, config.logInterval);

  /* every so often, update the mongo config with aggregate data about
   * each log.
   */

  updateInt = setInterval(function() {
    store.updateAggregates();
    util.log("Updated store aggregates.");
  }, config.updateInterval);

  /* every flushInterval (default: 1s), flush local messages to the datastore */

  flushInt = setInterval(function() {
    /* flush log messages */
    var messages, logger, size, msg, path;

    for (path in logMessages) {
      /* test to see if this is really a log, and if we have to send any lines */
      if (logMessages.hasOwnProperty(path) &&
          logMessages[path] && 
          logMessages[path].length) {

        /* The store knows how to append lines to a path, and to create any
         * missing files.  A callback is passable here, but won't do much.
         */
        store.appendLog(path, logMessages[path]);
        logMessages[path] = [];
      }
    }
  }, config.flushInterval);


  /* Every statsInterval (default: 10s), flush stats to graphite.  This code 
   * is exactly the same as the statsd code, as even the local storage is 
   * identical.
   */
  
  statsInt = setInterval(function() {
    var statString = '';
    var numStats = 0;
    var ts = Math.round(new Date().getTime() / 1000);
    var key, value;

    var sortValues = function(a,b) { return a-b; }; 

    /* counters generally increment monotonically over a period of time, and
     * are useful for counting the number of events of a given type that are
     * happening each second.  The mean is taken over the course of the
     * interval to be charted, with the counter getting the full value (ie
     * the total number of events over the interval).
     */
    for (key in counters) {
      if (counters.hasOwnProperty(key)) {
        /* normalize the value of the counter based on the statsInterval */
        value = counters[key] / (config.statsInterval / 1000);
        statString += 'stats.' + key + ' ' + value + ' ' + ts + "\n";
        counters[key] = 0;
        numStats += 1;
      }
    }

    /* meters are statistics which record the given level of some value over
     * time.  They are different from counters in that they are not designed
     * for counting events but for keeping track of particular values, such
     * as the size of a queue or the number of available resources.
     */

    for (key in meters) {
      if (meters.hasOwnProperty(key)) {
        /* unlike the counters, take the mean of the meter values over the period
         * based on the number of readings rather than the number of seconds
         */

        value = (meters[key].count) ? (meters[key].total / meters[key].count) : 0;
        statString +=  'stats.meters.' + key + ' ' + value + ' ' + ts + "\n";
        statString += 'stats.mcounts.' + key + ' ' + meters[key].count + ' ' + ts + "\n";

        meters[key].count = 0;
        meters[key].total = 0;

        numStats += 1;
      }
    }

    /* timers are specifically for storing duration data for certain critical
     * sections or operations.  They are stored in graphite with some
     * additional pre-calculated statistical values like mean, percentiles, etc
     */

    for (key in timers) {
      if (timers.hasOwnProperty(key)) {
        if (typeof (timers[key].times) != "undefined" && timers[key].times.length > 0) {
          var pctThreshold = config.percentThreshold;
          var values = timers[key].times.sort(sortValues);
          var numValues = values.length;
          var rates = timers[key].rates;
          var count = 0;
          var min = values[0];
          var max = values[numValues - 1];

          var mean = min;
          var maxAtThreshold = max;
          var i = 0;

          for (i=0; i < rates.length; i++) {
            count += 1 / rates[i];
          }

          if (count > 1) {
            var thresholdIndex = Math.round(((100 - pctThreshold) / 100) * numValues);
            var numInThreshold = numValues - thresholdIndex;
            var sum = 0, i = 0;

            values = values.slice(0, numInThreshold);
            maxAtThreshold = values[numInThreshold - 1];

            // average the remaining timings
            for (i = 0; i < numInThreshold; i++) {
              sum += values[i];
            }

            mean = sum / numInThreshold;
          }

          timers[key] = {timers:[], rates:[]};

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
    }

    statString += 'stats.numStats ' + numStats + ' ' + ts + "\n";
    if (numStats) {
      if (config.debug) {
        util.log("Sending stats string: \n" + statString);
      }
      sendStats(config, statString);
    }

  }, config.statsInterval);

});


