#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""Logging handlers for pylogd."""

__all__ = ['PylogdHandler']

import msgpack
from logging.handlers import DatagramHandler

class PylogdHandler(DatagramHandler):
    """A logging handler that sends messages to Pylogd.  Initialize with
    the host and port (default: localhost:8126)."""
    def __init__(self, path, host='localhost', port=8126):
        port = int(port)
        self.path = path
        # the eventual base of DatagramHandler is not new-style
        DatagramHandler.__init__(self, host, port)

    def makeMessage(self, record):
        """Packs the record in a binary format and returns it ready for
        transmission across the socket."""
        ei = record.exc_info
        if ei:
            dummy = self.format(record) # just to get traceback text into record.exc_text
            record.exc_info = None  # to avoid Unpickleable error
        msg = {
            'id': 1, # log message type
            'name': record.name,
            'path': self.path,
            'pid': record.process,
            'time': record.created,
            'msg': record.msg,
            'level': record.levelname,
            'loc': '%s %s:%s' % (record.pathname, record.funcName, record.lineno),
        }
        if record.exc_text:
            msg['tb'] = record.exc_text
        s = msgpack.dumps(msg)
        if ei:
            record.exc_info = ei  # for next handler
        return s

    def emit(self, record):
        """Emits a record to logd."""
        try:
            s = self.makeMessage(record)
            self.send(s)
        except (KeyboardInterrupt, SystemExit):
            raise
        except:
            self.handleError(record)

