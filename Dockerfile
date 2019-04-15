FROM node:10-alpine

ARG GEMFURY_TOKEN
ENV GEMFURY_TOKEN=${GEMFURY_TOKEN}

WORKDIR /bluefin-link

COPY . .

RUN apk add --no-cache bash

RUN apk add --no-cache git

RUN yarn install