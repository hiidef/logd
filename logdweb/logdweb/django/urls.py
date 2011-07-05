#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""logdweb urls."""

import os
from django.conf.urls.defaults import patterns

moduledir = os.path.dirname(__file__)
docroot = os.path.abspath(os.path.join(moduledir, '../static'))
print "DOCROOT: ", docroot

urlpatterns = patterns('logdweb.django.views',
    (r'^$', 'index', {}, 'logd-index'),
    (r'^(?P<path>[^/]+)/?$', 'path_index', {}, 'logd-path-index'),
    (r'^(?P<path>[^/]+)/level/(?P<level>\w+)/?$', 'path_level', {}, 'logd-path-level'),
    (r'^(?P<path>[^/]+)/logger/(?P<logger>\w+)/?$', 'path_logger', {}, 'logd-path-logger'),
)

urlpatterns += patterns('django.views.static',
    (r'^_media/(?P<path>.*)$', 'serve', {'document_root': docroot}, 'logd-media'),
)
