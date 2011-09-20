logd
----

Logd is a system for centralized logging and data collection written in
javascript for nodejs.  It started as a fork off of `statsd`_, but is not
strictly compatible with it.  Logd uses a simple, flexible binary wire 
protocol (via `msgpack`_) and is more easily extended to support new message
types.  Logd sends log messages to `mongodb`_ and stats to `graphite`_.  
Neither aspect of logd is required to run the other;  you can run logs 
without setting up graphite and stats without setting up mongo.

.. _statsd: https://github.com/etsy/statsd
.. _msgpack: http://msgpack.org/
.. _graphite: http://graphite.wikidot.com/quickstart-guide
.. _mongodb: http://mongodb.org

installing
----------

logd requires `nodejs`_ v0.4 or higher, and the ``msgpack-0.4`` and 
``mongodb`` (node-mongo-native) packages.  It is recommended that you compile
the native bson parser.

On OSX, ``brew install node`` should install a usable version.  After 
installing node, you should also install `npm`_ via the instructions on their
site.  The original ``msgpack`` library for node does not compile against
new versions of node and is unmaintained.  If you are having trouble
installing msgpack, install it from jmars' repos::

``npm install https://github.com/jmars/node-msgpack/tarball/master``

.. _nodejs: http://nodejs.org
.. _npm: http://npmjs.org

running logd
------------

To run logd, simply use node to run logd/logd.js:

``node logd/logdjs sampleConfig.js``

Create a new config file with the proper settings for your local setup. 

using logd
----------

There is an official web frontend for logd called `logdweb`_.

There is an official python interface for logd's logging and statsd-style stats
called `pylogd`_, which also ships with twisted modules.

.. _logdweb: https://github.com/hiidef/logdweb
.. _pylogd: https://github.com/hiidef/pylogd

stats types
-----------

The three basic types of stats are ``timers``, ``meters``, and ``counters``.
Their operation is slightly different but they provide most of what you might
want to record.

timers
******

Timers accumulate timed data, then saves top-90, mean, et al values at the
flush interval.  They are identical to ``statsd``'s notion of timers, and are
good when you want to record how long operations take.

meters
******

Meters are a concept not present in ``statsd``.  They are for storing and viewing
the fluctuations of some particular value over time, such as the amt of free
memory or the size of a queue.  Unlike counters, meters tell you approximately
what the value of something was at a given time.  A count is still taken and
stored, but its purpose is mostly so you can keep track of whether or not you
need to alter the sample rate.

counters
********

Counters are identical to counters in ``statsd``.  Increment or decrement them at
will, they are accumulated by logd and then the mean over the flush interval is
taken and sent to logd.  They are usful when you want to know how many events
of a given type are happening per second, like requests or logins.


technical details
-----------------

If you think node is not ready for production or want to write your own logd
daemon, here are some details on logd's behavior.

log messages
************

The logd data format must contain at least::

    { 
        id: 1,
        path: (str),
        level: (int),
        msg: (str),
        name: (str),
        time: (double),
    }

counters
********

The counter data format is specific and should match::

    {
        id: 2,
        key: (str),
        value: (int -- optional),
        sampleRate: (int -- optional)
    }

timers
******
    
The timer format::

    {
        id: 3,
        key: (str),
        value: (double),
    }

meters
******

The meter format::

    {
        id: 5,
        key: (str),
        value: (double),
        sampleRate: (int -- optional, ignored)
    }

