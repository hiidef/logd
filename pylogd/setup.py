#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""Setup script for pylogd."""

from setuptools import setup, find_packages

from pylogd import VERSION
version = '.'.join(map(str(VERSION)))

# some trove classifiers:

# License :: OSI Approved :: MIT License
# Intended Audience :: Developers
# Operating System :: POSIX

setup(
    name='pylogd',
    version=version,
    description="logd python library",
    long_description=open('README.rst').read(),
    # Get strings from http://pypi.python.org/pypi?%3Aaction=list_classifiers
    classifiers=[
        'Development Status :: 3 - Alpha',
        'License :: OSI Approved :: MIT License',
        'Intended Audience :: Developers',
    ],
    keywords='logd python udp logging server',
    author='Jason Moiron',
    author_email='jason@hiidef.com',
    url="'http://github.com/hiidef/logd'",
    license='MIT',
    packages=find_packages(exclude=['ez_setup', 'examples', 'tests']),
    include_package_data=True,
    zip_safe=False,
    test_suite="tests",
    # -*- Extra requirements: -*-
    install_requires=[
        'msgpack-python',
    ],
    entry_points="""
    # -*- Entry points: -*-
    """,
)
