logd
----

Logd right now is an experiment in centralized logging.  The plan is to
implement a UDP server in nodejs (based off code from `statsd`_) and have it
write to a Redis server.  The initial wire protocol is `msgpack`_, but this
might change in the future.

.. _statsd: https://github.com/etsy/statsd
.. _msgpack: http://msgpack.org/

installing
----------

logd requires a new-ish version of `nodejs`_;  v0.4 or higher should work.  On
OSX, ``brew install node`` should install a usable version.  After installing
node, you should also install `npm`_ via the instructions on their site.

From there, you should install msgpack:

``npm install https://github.com/jmars/node-msgpack/tarball/master``

The default msgpack repository unfortunately contains some code that does not 
work properly with recent changes in nodejs.

.. _nodejs: http://nodejs.org
.. _npm: http://npmjs.org

running logd
------------

To run logd, simply use node to run logd/logd.js:

``node logd/logdjs sampleConfig.js``

Create a new config file with the proper settings for your local setup.

running the tests
-----------------

To hammer the logd server, run logd on a server and then use the 
``tests/hammer.py`` script to hammer it relentlessly.  ``hammer`` requires
the package ``msgpack-python``, which can be installed via pip/easy_install,
but otherwise should run on any python version that has multiprocessing.

The default test run uses one process per CPU to send 10000 dgram messages
to logd.  The host, port, concurrency, and total number of messages can be
altered with commandline arguments;  see ``tests/hammer.py --help``.

