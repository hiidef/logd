
Concepts
========

Here a few of the underlying concepts of logd.

Logs
----

logd attempts to not break too many of the conventions of an on-fs log.  
Logs all get a ``path``, which is just a name that can include any
characters legal for a mongo collection, and they can have associated 
:ref:`configuration <log-configuration>` options like the maximum size in 
bytes and lines.

Stats
-----

The three basic types of stats are ``counters``, ``timers``, and ``meters``.
They work differently, and each is useful to track different types of
performance characteristics.

.. _buckets:

Stats are kept in ``buckets``.  A ``bucket`` is just a name for a stat,
and it becomes the location of that stat on the graphite server.  The standard
logd stat viewer, `logdweb`_ will utilize common parts of a bucket to group
charts together on a page, or group stats together in a chart.  Refer to its
documentation for more details on bucket names.

.. _statsd: https://github.com/etsy/statsd
.. _logdweb: https://github.com/hiidef/logdweb

counters
********

Counters increment (or decrement, or change-by) a single integer in a bucket.
After the flush interval, the counter is divided by the duration of the flush
period and sent to graphite.  Counters measure the `rate` at which certain
events happen;  their values are always "per second."

.. _timers:

timers
******

Timers accumulate timed data, then save top-90th-percentile, mean, min, and
max values accumulated over the flush interval.  They record how long things
take.

meters
******

Meters are a concept not present in ``statsd``.  Meters simply store a value
in logd, which then gets flushed out to graphite.  Meters measure a specific
value over time, and are good for measurements that do not involve `rates`,
like memory usage, queue size, etc.


