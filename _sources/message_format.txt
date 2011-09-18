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

protocol
--------

Logd's messages are packed with `msgpack`_, which is similar to json,
but is a binary protocol rather than a text one, and is both a bit faster to
parse and smaller to transmit.

Each of the different messages carry with it an ``id`` which denotes the type
of message.  The rest of the message is considered the payload and is different
for each message type::

    log: 1
    counter: 2
    timer: 3
    meter: 4

.. _msgpack: http://msgpack.org/

log messages
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


counters
--------

Counters, like all stats, require a ``key`` and a ``value``.  The ``key``
becomes the stats bucket in graphite::

    {
        id: 2,
        key: (String),
        value: (int),
        [sampleRate]: (int)
    }
    
The ``sampleRate`` parameter is optional, but if provided, it will be used
to compensate for the value when they are flushed.  For instance, if a
sample rate of ``20`` is given, that is assumed to be ``20%``, and the value
for that counter will be multiplied by ``100/20`` (or ``5``).

timers
------
    
The timer format::

    {
        id: 3,
        key: (String),
        value: (double)
    }

Timers do not take ``sampleRates``, and their ``value`` is in seconds.

meters
------

The meter format::

    {
        id: 4,
        key: (String),
        value: (double),
        [sampleRate]: (int)
    }

The ``sampleRate`` again is optional, but even if it is provided it does not
have any measurable impact on the meter's value.

