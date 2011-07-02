logd
----

Logd is a system for centralized logging and data collection written in node
with client libraries in node and python.  Its architecture and stats
collection is heavily based off of `statsd`_, but it uses a simple, flexible
binary wire protocol (via `msgpack`_) and is more easily extended to support
new message types.  Logd persists its log messages to `redis`_, but the plan
is to be more or less consistent with `statsd`_ by logging statistics to
`graphite`_.

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


data formats
~~~~~~~~~~~~

log messages
************

The logd data format must contain at least::

    { 
        type: 1,
        path: (str),
        level: (int),
        msg: (str),
        time: (double),
    }

Log Levels:

* 10: debug
* 20: info
* 30: warning
* 40: error
* 50: fatal

counters
********

The counter data format is specific and should match::

    {
        type: 2,
        key: (str),
        value: (int -- optional),
        sampleRate: (int -- optional)
    }

timers
******
    
The timer format::

    {
        type: 3,
        key: (str),
        value: (double),
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

Once in a while (how long?), logd will truncate the main list of messages to
the configured maximum size and flush deleted messages from the database and
the other filtered sets.

