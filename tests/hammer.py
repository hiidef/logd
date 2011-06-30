#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""Stress tests for logd."""

import sys
import time

from uuid import uuid4

import multiprocessing
import msgpack
import socket

def sendmsg(sock, to):
    id = uuid4().hex
    msg = {'id': id, 'msg': 'sending %s' % id}
    msgb = msgpack.packs(msg)
    return sock.sendto(msgb, to)

def sendnmsg(to, n):
    success = 0
    t0 = time.time()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    for i in xrange(n):
        ret = sendmsg(sock, to)
        success += 1 if ret else 0
    td = time.time() - t0
    print 'Sent %d of %d in %0.2f' % (success, n, td)

def main():
    opts, args = parse_args()
    pool = multiprocessing.Pool(opts.concurrency)
    to = (opts.host, opts.port)
    print "Sending %d messages to %s:%d (%d procs)" % (opts.number, opts.host,
            opts.port, opts.concurrency)
    t0 = time.time()
    for i in xrange(opts.concurrency):
        pool.apply_async(sendnmsg, (to, opts.number/opts.concurrency))
    pool.close()
    pool.join()
    td = time.time() - t0
    print 'Finished %d messages in %0.2f' % (opts.number, td)

def parse_args():
    import optparse
    parser = optparse.OptionParser(usage='./%prog [opts]', version='1.0')
    parser.set_conflict_handler("resolve")
    parser.add_option('-j', '--concurrency', default=multiprocessing.cpu_count(),
            help='number of concurrent processes')
    parser.add_option('-n', '--number', default=10000, help='number of messages')
    parser.add_option('-h', '--host', default='localhost', help='logd host')
    parser.add_option('-p', '--port', default=8126, help='logd port')
    opts, args = parser.parse_args()
    opts.port = int(opts.port)
    opts.concurrency = int(opts.concurrency)
    opts.number = int(opts.number)
    return opts, args

if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print "Interrupted."
        pass
