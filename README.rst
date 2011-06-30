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
node, you should also install `npm_` via the instructions on their site.

From there, you can install other dependencies:

 * ``npm install https://github.com/jmars/node-msgpack/tarball/master``
   (the origin repository doesn't compile against recent changes in node)


.. _nodejs: http://nodejs.org
.. _npm: http://npmjs.org

running the tests
-----------------

