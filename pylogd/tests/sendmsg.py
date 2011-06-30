#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""Send a message using pylogd."""

import sys
import logging
from pylogd.handlers import PylogdHandler

message = ' '.join(sys.argv[1:])

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger('sendmsg')
logger.addHandler(PylogdHandler())
logger.propagate = False
logger.info(message)

