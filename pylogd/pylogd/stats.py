#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""Logd's stats implementation.  Similar to the python_example in statsd's
repository."""

import msgpack
import random
import socket
import traceback
import logging

logger = logging.getLogger(__name__)

COUNTER = 2
TIMER = 3

class Logd(object):

    def __init__(self, host='localhost', port=8126):
        self.addr = (host, port)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    def timer(self, stat, time, sample_rate=1):
        """Log timing information."""
        self.send({'id': TIMER, 'key': stat, 'value': time}, sample_rate)

    def increment(self, stat, sample_rate=1):
        """Increment a counter."""
        self.change_by(stat, 1, sample_rate)

    def decrement(self, stat, sample_rate=1):
        """Decrement a counter."""
        self.change_by(stat, -1, sample_rate)

    def change_by(self, stat, by, sample_rate=1):
        """Change a counter by ``by``."""
        self.send({'id': COUNTER, 'key': stat, 'value': by}, sample_rate)

    def send(self, data, sample_rate=1):
        """Send data over the wire to logd."""
        if sample_rate < 1:
            if random.random() <= sample_rate:
                return
            data['rate'] = sample_rate

        msg = msgpack.dumps(data)
        try:
            self.sock.sendto(msg, self.addr)
        except:
            # ironically, this might make its way to logd...
            logging.error("unexpected error:\n%s" % traceback.format_exc())

