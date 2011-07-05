#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""Django jinja2 integration, inspired by:

    http://djangosnippets.org/snippets/1061/

"""

from logdweb.django import settings

from jinja2 import FileSystemLoader, FileSystemBytecodeCache, Environment, \
    PackageLoader, ChoiceLoader

from django.core.urlresolvers import reverse
from django.core.exceptions import ImproperlyConfigured
from django.template import RequestContext
from django.utils.importlib import import_module
from django.http import HttpResponse

# logdweb should be an installed app, so the loader can find our templates
loaders = [FileSystemLoader(path) for path in settings.TEMPLATE_DIRS]
loaders += [PackageLoader(app) for app in settings.INSTALLED_APPS]

cache = FileSystemBytecodeCache(settings.JINJA_BYTECODE_CACHE_DIR, '%s.cache')

env = Environment(
    extensions=settings.JINJA_EXTENSIONS,
    loader=ChoiceLoader(loaders),
    bytecode_cache=cache,
    cache_size=settings.JINJA_CACHE_SIZE,
)
env.globals.update({'reverse': reverse})

for name in settings.JINJA_FILTERS:
    path = settings.JINJA_FILTERS[ name ]
    i = path.rfind('.')
    module, attr = path[:i], path[i+1:]
    try:
        mod = import_module(module)
    except ImportError, e:
        raise ImproperlyConfigured('Error importing Jinja filter module %s: "%s"' % (module, e))
    try:
        func = getattr(mod, attr)
    except AttributeError:
        raise ImproperlyConfigured('Module "%s" does not define a "%s" callable Jinja filter' % (module, attr))
    env.filters[ name ] = func

for name in settings.JINJA_TESTS:
    path = settings.JINJA_TESTS[ name ]
    i = path.rfind('.')
    module, attr = path[:i], path[i+1:]
    try:
        mod = import_module(module)
    except ImportError, e:
        raise ImproperlyConfigured('Error importing Jinja filter module %s: "%s"' % (module, e))
    try:
        func = getattr(mod, attr)
    except AttributeError:
        raise ImproperlyConfigured('Module "%s" does not define a "%s" callable Jinja test' % (module, attr))
    env.tests[ name ] = func

for name in settings.JINJA_GLOBALS:
    path = settings.JINJA_GLOBALS[ name ]
    i = path.rfind('.')
    module, attr = path[:i], path[i+1:]
    try:
        mod = import_module(module)
    except ImportError, e:
        raise ImproperlyConfigured('Error importing Jinja filter module %s: "%s"' % (module, e))
    try:
        func = getattr(mod, attr)
    except AttributeError:
        raise ImproperlyConfigured('Module "%s" does not define a "%s" callable Jinja global' % (module, attr))
    env.globals[name] = func

def render_to_string(filename, context=None, request=None):
    """Render to string, similar to django's, but uses jinja."""
    context = {} if context is None else context
    template = env.get_template(filename)
    context['request'] = request
    rendered = template.render(**context)
    return rendered

def render_to_response(filename, context=None, request=None, mimetype=settings.DEFAULT_CONTENT_TYPE):
    """Render to response, similar to django's, but uses jinja."""
    rendered = render_to_string(filename, context, request)
    return HttpResponse(rendered,mimetype=mimetype)
