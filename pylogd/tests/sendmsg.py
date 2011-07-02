#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""Send a message using pylogd."""

import sys
import logging
from pylogd.handlers import PylogdHandler

message = ' '.join(sys.argv[1:])

logging.basicConfig(level=logging.DEBUG)
handler = PylogdHandler('test.log')

logger = logging.getLogger('logger1')
logger.addHandler(handler)
logger.propagate = False
logger.info(message)

logger2 = logging.getLogger('logger2')
logger2.addHandler(handler)
logger2.propagate = False
logger2.error(message)

