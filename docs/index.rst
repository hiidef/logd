.. logd documentation master file, created by
   sphinx-quickstart on Sat Sep 17 15:58:13 2011.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

.. highlight:: javascript

logd
====

logd is a centralized logging & statistics server written in javascript for 
nodejs.  It started as a fork off of `statsd`_, but does not maintain strict 
compatibility.  Logd uses a simple, flexible :doc:`binary wire 
protocol <message_format>` over UDP, and is more easily extended to support 
new message types.  Logd sends log messages to `mongodb`_ and stats to 
`graphite`_.  Neither aspect of logd is required to run the other;  you can 
run logs without setting up graphite and stats without setting up mongo.

.. _statsd: https://github.com/etsy/statsd
.. _msgpack: http://msgpack.org/
.. _graphite: http://graphite.wikidot.com/quickstart-guide
.. _mongodb: http://mongodb.org


Installing
----------

logd requires `nodejs`_ v0.4 or higher, and the ``msgpack-0.4`` and 
``mongodb`` (node-mongo-native) packages.  It is recommended that you compile
the native bson parser.

On OSX, ``brew install node`` should install a usable version;  on most
linuxes, you will want to compile your own.  After installing node, you should
also install `npm`_.  The original ``msgpack`` library for node does not 
compile against new versions of node and is unmaintained.  If you are having
trouble installing ``msgpack-0.4``, install it from jmars' repos:

.. code-block:: bash

    npm install https://github.com/jmars/node-msgpack/tarball/master

After installing the required components, attempt to run logd to check your
setup, and then look at the :doc:`configuration options<configuration>`.

.. _nodejs: http://nodejs.org
.. _npm: http://npmjs.org

Deploying
---------

To run logd in the foreground, simply use node to run logd/logd.js::

    node logd/logdjs sampleConfig.js

To run as a daemon, logd ships with a simple init script.  You can override
the following paths in ``/etc/default/logd`` to point to the locations where
you've decided to install logd:

.. code-block:: bash

    LOGD="/usr/bin/logd.js"
    CONFIG="/etc/logd/config.js"
    LOGD_LOG="/var/log/logd.log"
    PIDFILE="/tmp/logd.pid"

Keep in mind that ``npm`` will not install support packages globally by
default, and ``logd.js`` will have to run from wherever its ``node_modules``
support directory is.

Using logd
----------

There is an official web frontend for logd called `logdweb`_.  It presents a
basic web front-end to logd's logs and stats, grouping stats together based
on their :ref:`bucket <buckets>` names.

There is an official python library for integration with logd's logging and 
stats called `pylogd`_, which also ships with twisted modules.

.. _logdweb: https://github.com/hiidef/logdweb
.. _pylogd: https://github.com/hiidef/pylogd

Further documentation
---------------------

.. toctree::
    :maxdepth: 2
    
    concepts
    configuration
    message_format


