SHELL := /bin/bash

build:
	docker build --build-arg GEMFURY_TOKEN -t bluefin-link .