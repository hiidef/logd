logd
----

Logd is a system for centralized logging and data collection written in node
with client libraries in node and python.  Its architecture and stats
collection is heavily based off of `statsd`_, but it uses a simple, flexible
binary wire protocol (via `msgpack`_) and is more easily extended to support
new message types.  Logd persists its log messages to `redis`_, but tries
to be consistent with `statsd`_ by logging statistics to `graphite`_.  Using
the log aspect of logd is not required;  you should be able to run logd without
running a redis server.

.. _statsd: https://github.com/etsy/statsd
.. _msgpack: http://msgpack.org/
.. _redis: http://redis.io
.. _graphite: http://graphite.wikidot.com/quickstart-guide

installing
----------

logd requires `nodejs`_ v0.4 or higher, and the ``node-msgpack`` and ``redis``
extensions.  It is suggested that you also install ``hiredis`` as this will
significantly improve redis performance.

On OSX, ``brew install node`` should install a usable version.  After 
installing node, you should also install `npm`_ via the instructions on their
site.  Currently (2011-07-11), the version of the msgpack library available
in npm's registry is outdated and will not build against new versions of node.
Install a version from a fork that contains patches to fix it:

``npm install https://github.com/jmars/node-msgpack/tarball/master``

.. _nodejs: http://nodejs.org
.. _npm: http://npmjs.org

running logd
------------

To run logd, simply use node to run logd/logd.js:

``node logd/logdjs sampleConfig.js``

Create a new config file with the proper settings for your local setup.  You
will need redis (and, eventually, graphite) running.

Because of the way logd expires old log messages (see technical details section),
you are encouraged to use `maxmemory-policy volatile-ttl` and a sane `maxmemory`
value for your redis server to keep from using all available memory if your logs
get high traffic or have low cutoff points.

using logd
----------

There is an official web frontend for logd called `logdweb`_.

There is an official python interface for logd's logging and statsd-style stats
called `pylogd`_.

.. _logdweb: https://github.com/hiidef/logdweb
.. _pylogd: https://github.com/hiidef/pylogd

stats types
-----------

The three basic types of stats are `timers`, `meters`, and `counters`.  Their
operation is slightly different but they provide most of what you might want
to record.

timers
******

Timers accumulate timed data, then saves top-90, mean, et al values at the
flush interval.  They are identical to `statsd`'s notion of timers, and are
good when you want to record how long operations take.

meters
******

Meters are a concept not present in `statsd`.  They are for storing and viewing
the fluctuations of some particular value over time, such as the amt of free
memory or the size of a queue.  Unlike counters, meters tell you approximately
what the value of something was at a given time.  A count is still taken and
stored, but its purpose is mostly so you can keep track of whether or not you
need to alter the sample rate.

counters
********

Counters are identical to counters in `statsd`.  Increment or decrement them at
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

logd redis data layout
----------------------

Logd will use a configurable key prefix (default: "logd") for all of its redis
keys.  Logs can be separated by "path", which should be what you'd name your
logfile.  This way, multiple applications can log to logd.

* ``logd:paths`` - a set of paths
* ``logd:log:{path}:{id}`` - msg data (packed)
* ``logd:log:{path}`` - ordered list of all messages
* ``logd:log:{path}:next`` - next id of message for this path
* ``logd:log:{path}:level:{level}`` - zset of messages per level (5)
* ``logd:log:{path}:name:{name}`` - zset of messages per logger
* ``logd:log:{path}:names`` - a set of loggers seen on this path

Once in a while (by default 10s), logd will truncate the main list of messages 
to the configured maximum size and flush deleted messages from the database and
the other filtered sets.  Because of difficulties we've had getting redis to
reclaim the space evacuated by `del`-ed keys, the way this works is different
now.  Keys that fall off the edge of the log size are given an expiry (1 day),
and you are encouraged to use a newer version of redis with `maxmemory-policy`
set to `volatile-ttl` and a reasonable `maxmemory` value to ensure your redis
server does not run out of memory.

