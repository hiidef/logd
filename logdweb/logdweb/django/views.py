#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""logdweb admin views."""

from logdweb.django.django_jinja2 import render_to_response
from logdweb import models

def index(request):
    logd = models.Logd()
    info = logd.server_info()
    context = {
        'info': info,
    }
    return render_to_response('logdweb/index.jinja', context, request)

def path_index(request, path=""):
    logd = models.Logd()
    info = logd.server_info()
    lines = logd.get_lines(path)
    context = {
        'info': info,
        'path': path,
        'lines': lines,
    }
    return render_to_response('logdweb/index.jinja', context, request)

def path_level(request, path="", level=""):
    return render_to_response('logdweb/index.jinja', {}, request)

def path_logger(request, path="", logger=""):
    return render_to_response('logdweb/index.jinja', {}, request)

