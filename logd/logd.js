var dgram  = require('dgram')
  , sys    = require('sys')
  , net    = require('net')
  , msgpack = require('msgpack')
  , config = require('./config')
  , redis  = require('redis')

var msgsreceived = 0;
var oldmsgsreceived = 0;
var counters = {};
var timers = {};
var debugInt, flushInt, server;

function redisConnect(config) {
  var port = config.redisPort || 6379,
      host = config.redisHost || "localhost",
      options = config.redisOptions || {};

  var client = redis.createClient(port, host, options);

  client.on("error", function(err) {
    sys.log("Redis Error: " + err.message);
    /* if this was connection refused, lets exit */
    if (err.message.match(/ECONNREFUSED/)) {
      process.exit(-1);
    }
  });

  client.on("connect", function() {
    sys.log("connected to Redis server on " +
      (config.redisHost || 'localhost') + ":" +
      (config.redisPort || 6379));
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
    var port = config.port || 8126;

    server = dgram.createSocket('udp4', function (msg, rinfo) {
      if (config.dumpMessages) { sys.log(msg.toString()); }
      msgsreceived += 1;
      var blob = msgpack.unpack(msg);
      // console.log(blob);

      /*
      var bits = msg.toString().split(':');
      var key = bits.shift()
                    .replace(/\s+/g, '_')
                    .replace(/\//g, '-')
                    .replace(/[^a-zA-Z_\-0-9\.]/g, '');

      if (bits.length == 0) {
        bits.push("1");
      }

      for (var i = 0; i < bits.length; i++) {
        var sampleRate = 1;
        var fields = bits[i].split("|");
        if (fields[1] === undefined) {
            sys.log('Bad line: ' + fields);
            continue;
        }
        if (fields[1].trim() == "ms") {
          if (! timers[key]) {
            timers[key] = [];
          }
          timers[key].push(Number(fields[0] || 0));
        } else {
          if (fields[2] && fields[2].match(/^@([\d\.]+)/)) {
            sampleRate = Number(fields[2].match(/^@([\d\.]+)/)[1]);
          }
          if (! counters[key]) {
            counters[key] = 0;
          }
          counters[key] += Number(fields[0] || 1) * (1 / sampleRate);
        }
      }
      */
    });
    
    server.on("listening", function() {
      sys.log("logd listening on port " + port);
    });

    server.bind(port);

  }
    
  /* every second, print if we've received messages or not */
  var logInterval = Number(config.logInterval || 1000);

  logInt = setInterval(function() {
    if (msgsreceived != oldmsgsreceived) {
      dmsg = msgsreceived - oldmsgsreceived;
      oldmsgsreceived = msgsreceived;
      sys.log("Received " + dmsg + " messages in 1s (" + msgsreceived + " total).");
    }
  }, logInterval);
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


