#!/usr/bin/env node

var path = require("path");
var fs = require("fs");
var assign = require("object-assign");
var liveServer = require("./index");

var opts = {
	host: process.env.IP,
	port: process.env.PORT,
	open: true,
	mount: [],
	proxy: [],
	middleware: [],
	index: "index.html",
	logLevel: 2,
};

var homeDir = process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];
var configPath = path.join(homeDir, ".alive-server.json");
if (fs.existsSync(configPath)) {
	var userConfig = fs.readFileSync(configPath, "utf8");
	assign(opts, JSON.parse(userConfig));
}
var projConfigPath = path.join(process.cwd(), ".alive-server.json");
if (fs.existsSync(projConfigPath)) {
	var projConfig = fs.readFileSync(projConfigPath, "utf8");
	assign(opts, JSON.parse(projConfig));
}
if (opts.ignorePattern) opts.ignorePattern = new RegExp(opts.ignorePattern);
if (opts.ignore && typeof (opts.ignore) === "string") {
	opts.ignore = opts.ignore.split(",");
}
if (opts.watch && typeof (opts.watch) === "string") {
	opts.watch = opts.watch.split(",");
}

for (var i = process.argv.length - 1; i >= 2; --i) {
	var arg = process.argv[i];
	if (arg.indexOf("--port=") > -1) {
		var portString = arg.substring(7);
		var portNumber = parseInt(portString, 10);
		if (portNumber === +portString) {
			opts.port = portNumber;
			--i;
		}
	}
	else if (arg.indexOf("--host=") > -1) {
		opts.host = arg.substring(7);
		--i;
	}
	else if (arg.indexOf("--open=") > -1) {
		var open = arg.substring(7);
		switch (typeof opts.open) {
			case "boolean":
				opts.open = open;
				break;
			case "string":
				opts.open = [opts.open, open];
				break;
			case "object":
				opts.open.push(open);
				break;
		}
		--i;
	}
	else if (arg.indexOf("--watch=") > -1) {
		// Will be modified later when cwd is known
		opts.watch = arg.substring(8).split(",");
		--i;
	}
	else if (arg.indexOf("--ignore=") > -1) {
		// Will be modified later when cwd is known
		opts.ignore = arg.substring(9).split(",");
		--i;
	}
	else if (arg.indexOf("--ignorePattern=") > -1) {
		opts.ignorePattern = new RegExp(arg.substring(16));
		--i;
	}
	else if (arg === "--no-css-inject") {
		opts.noCssInject = true;
		--i;
	}
	else if (arg === "--no-browser") {
		opts.open = false;
		--i;
	}
	else if (arg.indexOf("--browser=") > -1) {
		opts.browser = arg.substring(10).split(",");
		--i;
	}
	else if (arg.indexOf("--entry-file=") > -1) {
		var file = arg.substring(13);
		if (file.length) {
			opts.file = file;
			--i;
		}
	}
	else if (arg === "--spa") {
		opts.middleware.push("spa");
		--i;
	}
	else if (arg === "--quiet" || arg === "-q") {
		opts.logLevel = 0;
		--i;
	}
	else if (arg === "--verbose" || arg === "-V") {
		opts.logLevel = 3;
		--i;
	}
	else if (arg.indexOf("--mount=") > -1) {
		// e.g. "--mount=/components:./node_modules" will be ["/components", "<process.cwd()>/node_modules"]
		// split only on the first ":", as the path may contain ":" as well (e.g. C:\file.txt)
		var match = arg.substring(8).match(/([^:]+):(.+)$/);
		match[2] = path.resolve(process.cwd(), match[2]);
		opts.mount.push([ match[1], match[2] ]);
		--i;
	}
	else if (arg.indexOf("--wait=") > -1) {
		var waitString = arg.substring(7);
		var waitNumber = parseInt(waitString, 10);
		if (waitNumber === +waitString) {
			opts.wait = waitNumber;
			--i;
		}
	}
	else if (arg === "--version" || arg === "-v") {
		var packageJson = require("./package.json");
		console.log(packageJson.name, packageJson.version);
		process.exit();
	}
	else if (arg.indexOf("--htpasswd=") > -1) {
		opts.htpasswd = arg.substring(11);
		--i;
	}
	else if (arg === "--cors") {
		opts.cors = true;
		--i;
	}
	else if (arg.indexOf("--https=") > -1) {
		opts.https = arg.substring(8);
		--i;
	}
	else if (arg.indexOf("--https-module=") > -1) {
		opts.httpsModule = arg.substring(15);
		--i;
	}
	else if (arg.indexOf("--proxy=") > -1) {
		// split only on the first ":", as the URL will contain ":" as well
		var match = arg.substring(8).match(/([^:]+):(.+)$/);
		opts.proxy.push([ match[1], match[2] ]);
		--i;
	}
	else if (arg.indexOf("--middleware=") > -1) {
		opts.middleware.push(arg.substring(13));
		--i;
	}
	else if (arg.indexOf("--mimetypes=") > -1) {
		// e.g. --mimetypes='{\"application/wasm\": [\".wasm\"]}' or --mimetypes="{'application/wasm': ['.wasm']}"
		var mimetypesString = arg.substring(12).replace(/'/g, '"');
		var mimetypes = typeof opts.mimetypes === "object" && !(opts.mimetypes instanceof Array) ? opts.mimetypes : {};
		opts.mimetypes = assign(mimetypes, JSON.parse(mimetypesString));
		--i;
	}
	else if (arg.indexOf("--index=") > -1) {
		opts.index = arg.substring(8);
		--i;
	}
	else if (arg === "--help" || arg === "-h") {
		console.log("Usage: alive-server [-v|--version] [-h|--help] [-q|--quiet] [--port=PORT] [--host=HOST] [--open=PATH] [--no-browser] [--browser=BROWSER] [--ignore=PATH] [--ignorePattern=RGXP] [--no-css-inject] [--entry-file=PATH] [--spa] [--mount=ROUTE:PATH] [--wait=MILLISECONDS] [--htpasswd=PATH] [--cors] [--https=PATH] [--https-module=MODULE_NAME] [--proxy=PATH] [PATH]");
		process.exit();
	}
	else if (arg === "--test") {
		// Hidden param for tests to exit automatically
		setTimeout(liveServer.shutdown, 500);
		--i;
	}
}

// Patch paths
var dir = opts.root = process.argv[2] || "";

if (opts.watch) {
	opts.watch = opts.watch.map(function(relativePath) {
		return path.join(dir, relativePath);
	});
}
if (opts.ignore) {
	opts.ignore = opts.ignore.map(function(relativePath) {
		return path.join(dir, relativePath);
	});
}

liveServer.start(opts);
