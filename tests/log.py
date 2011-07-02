#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""Tests for logd written in python."""

import os
import unittest
import time
import socket
import redis
import msgpack

try:
    import simplejson as json
except ImportError:
    import json

modpath = os.path.abspath(os.path.dirname(__file__))
with open(os.path.join(modpath, '../sampleConfig.js')) as f:
    config = json.load(f)

class LogdLogTest(unittest.TestCase):
    def __init__(self, *args, **kwargs):
        self.host = config.get("host", "localhost")
        self.port = config.get("port", 8126)
        self.logd = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.redis = redis.Redis(host=config["redis"].get("host", "localhost"),
                port=config["redis"].get("port", 6379),
                db=0)
        self.path = "__logdtest.log__"
        self.prefix = config.get("prefix", "logd")
        self.base = "%s:log:%s" % (self.prefix, self.path)
        super(LogdLogTest, self).__init__(*args, **kwargs)

    def _send(self, msg, name, level=10):
        msg = {'msg': msg, 'name': name, 'id': 1, 'path': self.path,
            'time': time.time(), 'level': level}
        txtmsg = msgpack.packs(msg)
        self.logd.sendto(txtmsg, (self.host, self.port))

    def tearDown(self):
        """Remove our test logger's logs."""
        messages = self.redis.lrange(self.base, 0, -1)
        names = self.redis.smembers('%s:names' % (self.base))
        self.redis.srem('%s:paths' % self.prefix, self.path)
        for message in messages:
            self.redis.delete("%s:%s" % (self.base, message))
        for name in names:
            self.redis.delete("%s:name:%s" % (self.base, name))
        for level in (10, 20, 30, 40, 50):
            self.redis.delete("%s:level:%s" % (self.base, level))
        self.redis.delete(self.base)
        self.redis.delete("%s:names" % self.base)
        self.redis.delete("%s:next" % self.base)

    def test_logger(self):
        """Test that basic logging functions work."""
        self._send('test message 1', 'testlogger1')
        self._send('test message 2', 'testlogger1', 20)
        self._send('test message 1 from logger 2', 'testlogger2', 30)
        time.sleep(1.5) # wait for logd to flush
        self.assertTrue(self.redis.exists(self.base))
        for i in (1,2):
            key = '%s:%s' % (self.base, i)
            self.assertTrue(self.redis.exists(key))
            msg = msgpack.loads(self.redis.get(key))
            self.assertEqual(msg['msg'], 'test message %s' % i)
            self.assertEqual(msg['name'], 'testlogger1')

