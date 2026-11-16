# Ports

The json-server CLI listens on port **3000** by default.

To use a different port, pass `-p` or `--port`:

```sh
json-server --port 4000 db.json
json-server -p 4000 db.json
```

If `--port` is not given, the `PORT` environment variable is used when it is set; otherwise the port is 3000.

The host is `localhost` by default.
