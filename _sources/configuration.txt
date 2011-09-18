Configuration
=============

.. highlight:: javascript

Logd ships with a sample configuration file, but because its config file is
in JSON format and JSON cannot have inline comments, there is no inline
documentation on the available options.

Sample
------

Here's the ``sampleConfig.js`` file included within the distribution::

    {
      "debug": false,
      "port": 8126,
      "graphite": {
        "port": 2003,
        "host": "localhost"
      },
      "mongo" : {
        "host": "localhost", 
      },
      "logs": {
        "default": {
          "size": 262144000,
          "max": 1000000,
        }
      }
    }

Global options
--------------

* **debug**: boolean, when ``true`` it enables an extra periodic status message
  useful for debugging logd.

* **port**: the numeric port for logd to listen on.  The default port for logd
  is ``8126``, which is one more than the default port for statsd.

* **percentThreshold**: the percentile you want calculated on 
  :ref:`timers <timers>`.  The default is ``90``.

intervals
~~~~~~~~~

Logd is completely event driven, but it caches log messages and stats for a
period before flushing them out to the backends.  These intervals should be
integers and are in terms of msecs.

* **debugInterval**: the interval at which debug info is printed, default: 
  ``10000`` (10s)
* **flushInterval**: the interval at which logs are flushed to mongodb,
  default: ``1000`` (1s)
* **statsInterval**: the interval at which stats are sent to graphite,
  default: ``10000`` (10s).  This should not be different from the granularity
  set up in graphite;  if the smallest time period for saving stats in graphite
  is 5s, this should be 5s as well.
* **logInterval**: the interval at which logd prints its own activity,
  default: ``1000``.  

Graphite
--------

Graphite is configured by an object in the ``graphite`` configuration key.
If absent, a warning is printed, and the following defaults are used::

    "graphite": {
      port: 2003,
      host: "localhost"
    }

* **port**: the port that the ``carbon-cache.py`` daemon is running on
* **host**: the host that the ``carbon-cache.py`` daemon is running on

MongoDB
-------

MongoDB is configured by an object in the ``mongo`` configuration key.  If
absent, the following defaults are used::

    "mongo": {
      port: 27017,
      host: "localhost"
      db: "logd",
      options: {
        native_parser: true
      }
    }

* **port**: the port MongoDB is running on
* **host**: the host MongoDB is running on.  Note that logd collections are
  capped, and cannot be sharded across hosts.
* **db**: the database name logd should store its logs in
* **options**: a configuration object to pass to ``mongodb.Db``;  If absent
  the ``native_parser`` from the node-mongo-native library will be turned on.
  Provided for users who might need or want to turn off the ``native_parser``.

.. _log-configuration: 

Log Configuration
-----------------

The log section is an object that contains a key for every log path and options
for that log path.  The special key ``default`` is applied for new logs who are
not specifically configured.  If ``default`` is absent, it is set to::

    "default": { 
      size: 26144000,
      max: 1000000
    }

* **size**: the maximum size in bytes for this log file
* **max**: the maximum number of records to save for this log file

