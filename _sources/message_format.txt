Message Format
==============

.. highlight:: javascript

Below the message format for log messages & stats are described.  If you'd like
to write a client to send messages and stats to logd in your preferred
programming language, the information in this document should suffice.

If you'd like to write a `server` to replace the javascript implementation of
logd (maybe you cannot get nodejs into production at your workplace), it's
recommended that you read this document and then look at the source in logd
to make sure your stats handling is compatible.

Protocol
--------

Logd's messages are packed with `msgpack`_, which is similar to json,
but is a binary protocol rather than a text one, and is both a bit faster to
parse and smaller to transmit.

Each of the different messages carry with an ``id`` which denotes the type
of message.  The rest of the message is considered the payload and is different
for each message type::

    log: 1
    counter: 2
    timer: 3
    meter: 4

Many of the stats types take an optional ``sampleRate`` parameter, which is
a fraction from 1 of the number of events encountered that are sent to the
server.  For instance, if you encounter an event on the order of 1000/sec,
you can apply a ``0.01`` sample rate, sending on average 10 packets/sec to
logd, which will then apply the reverse of the sample rate to give you an
approximation of the *real* rate.

The messages are described below as they'd appear in a JSON document, but they
should be encoded with a msgpack encoder and sent via UDP over the wire.

.. _msgpack: http://msgpack.org/

Log messages
------------

Log messages have an ``id`` of 1 and are expected to contain at least::

    { 
        id: 1,
        path: (String),
        level: (String),
        msg: (String),
        name: (String),
        time: (double)
    }

The ``path`` parameter should denote the "log file" that this message is
intended for.  The ``level`` can be anything, but is generally something like
"debug", "info", or "critical".  ``msg`` is the log message.  ``name`` is the 
name of the logger;  this can be a file path, or the name of the library, or 
ignored;  but it must be included in the message.  ``time`` should be a unix 
timestamp.


Counters
--------

Counters, like all stats, require a ``key`` and a ``value``.  The ``key``
becomes the stats bucket in graphite::

    {
        id: 2,
        key: (String),
        value: (int),
        [sampleRate]: (double)
    }
    
The ``sampleRate`` parameter is optional, but if provided, it will be used
to compensate for the value of the counter.

Timers
------
    
The timer format::

    {
        id: 3,
        key: (String),
        value: (double),
        [sampleRate]: (double)
    }

The ``sampleRate`` parameter is optional, but if provided, it will be used to
compensate for the "count" in the resulting time data so that it reflects the
number of events encountered rather than the number of data points.

Meters
------

The meter format::

    {
        id: 4,
        key: (String),
        value: (double),
        [sampleRate]: (double)
    }

The ``sampleRate`` again is optional, but even if it is provided it does not
have any measurable impact on the meter's value.

