# Orcale Database Browser

A simple tool for browsing Oracle databases, allowing you to display a list of tables,
views and synonyms for multiple users, and get column details on tables/views.

You can also execute arbitrary SQL and the results are shown similarly to
table/view column info.

I made this because Oracle SQL Developer is a bit heavyweight and makes my
computer sad.

## Installation and running

You will need Node (obviously) and the stuff listed in the Installation section
of the [node-oracledb](https://github.com/oracle/node-oracledb) README.

To install:

```
npm install
```

You might need to specify Oracle SDK file paths (the error message will tell
you how if it comes up).

To run the server, you need to provide the Oracle connection string as an
environment variable, then run `npm start`, e.g.:

```
DB_CONNECTION=localhost/myawesomedb npm start
```

## Connections

At the moment the app naïvely assumes you are connecting to the same database
but as different uers, and doesn't do anything to remember which connections
you've used previously. I'll get around to adding a proper connection manager
eventually, then you won't need to do the environment variable stuff above.

## Other stuff

Due to a [limitation with the Oracle Node
library](https://github.com/oracle/node-oracledb/issues/261), LONG and LONG RAW
column types are not supported. In particular, some installations of Oracle
store view text in a LONG-type column, thus the app is unable to fetch this
information.

The frontend code is also an organic mess, and needs some Backbone.
