var consul;
var functionite = require('functionite');

module.exports = function (ip) {
	consul = require('consul')({host: ip}); //start a consul agent
	return {
		getSetCheck: getSetCheck,
		watchServices: watchServices,
		watchAllServices: watchAllServices,
		watchServiceStatus: watchServiceStatus,
		watchKVStore: watchKVStore,
		getAllServices: getAllServices,
		getService: getService,
		getServiceAddresses: getServiceAddresses,
		setKeyValue: setKeyValue,
		getKeyValue: getKeyValue,
		getKeyAll: getKeyAll,
		delKey: delKey,
		delKeyAll: delKeyAll,
		lock:lock
	}
}

//abstracts away the implementation of getting a key and then altering the data in the remote store
//at a later time, while still ensuring noone else has altered the store within that time frame
//eventually returns whether the set operation was successful (boolean)
function getSetCheck (key, callback) {
	var modIndex;
	consul.kv.get(key, function (err, res) {
		if (res) {
			modIndex = res.ModifyIndex;
		}
		callback(res, setter);
	});

	function setter (value, innerCallback) {
		var options = {
			key: key,
			value: value,
			cas: modIndex
		}
		consul.kv.set(options, function (err, res) {
			innerCallback(res);
		});
	}
}

//preferred method to use
function watchAllServices (callback) {
	//set up template object to pass through consul
	var options = {
		method: consul.catalog.service.list
	}
	var watch = consul.watch(options);
	watch.on('change', function (services, res) {
		callback(services);
	});
	watch.on('error', function (err) {
		throw err;
	});
	return watch;
}

//check for updates in a service
function watchServices (callback) {
	//set up template object to pass through consul
	var options = {
		method: consul.catalog.service.list
	}
	var watch = consul.watch(options);
	watch.on('change', function (services, res) {
		//everytime a change is detected, get the updated list of services
		functionite()
		.to(getAllServices)
		.to(setUpHelperFunctions)
		.then(function (results) {
			callback(results[0]);
		});
	});
	watch.on('error', function (err) {
		throw err;
	});

	//add helper functions to the services array such as filtering and ending the watch
	function setUpHelperFunctions (services, callback) {
		services.filter = filterWatches.bind(undefined, services);
		//ends the watch
		services.end = watch.end;
		callback(services);
	}

	//returns only services with the same name as serviceName
	function filterWatches (services, serviceName) {
		var filteredServices = [];
		for (let i in services) {
			if (services[i].Service == serviceName) {
				filteredServices.push(services[i]);
			}
		}
		return filteredServices;
	}
}

//sets up a health check for services of a certain name
//meant to replace the watchServices function
function watchServiceStatus (serviceName, callback) {
	var options = {
	    method: consul.health.service,
	    options: {service: serviceName}
	}

	var watch = consul.watch(options);
	watch.on('change', function (services, res) {
	    //everytime a change is detected, get the updated list of services
	    callback(services);
	});
	watch.on('error', function (err) {
	    throw err;
	});
	return watch; //return the watch object
}

//check for updates in the KV store
function watchKVStore (key, callback) {
	//set up template object to pass through consul
	var options = {
		method: consul.kv.keys,
		options: {key: key}
	}
	var watch = consul.watch(options);
	watch.on('change', function (results, res) {
		//everytime a change is detected, return the results
		callback(results);
	});
	watch.on('error', function (err) {
	});
}

//sets a key/value in the KV store
function setKeyValue (key, value, callback) {
	var options = {
		key: key,
		value: value
	}
	consul.kv.set(options, function(err, result) {
		if (err) throw err;
		if (callback) {
			callback();
		}
	});
}

//gets a value in the KV store
function getKeyValue (key, callback) {
	consul.kv.get(key, function (err, result) {
		callback(result);
	});
}

//gets everything under key
function getKeyAll (key, callback) {
	const opts =  {
		key: key,
		recurse: true
	}
	consul.kv.get(opts, function (err, result) {
		callback(result);
	});
}

//deletes a key in the KV store
function delKey (key, callback) {
	consul.kv.del(key, function (err) {
		callback();
	});
}

//deletes all keys under a key in the KV store
function delKeyAll (key, callback) {
	const opts =  {
		key: key,
		recurse: true
	}
	consul.kv.del(opts, function (err) {
		callback();
	});
}

function lock (key) {
	return consul.lock({key: key});
}

//return all services found in consul for the database
function getAllServices (callback) {
	functionite()
	.to(getNodes)
	.to(getServicesInNodes)
	.then(function (results) {
		callback(results[0]);
	});
}

//return one service
function getService (serviceName, callback) {
	consul.health.service(serviceName, function (err, result) {
		callback(result);
	});
}



//pass in a consul service name and return addresses of all those services
function getServiceAddresses (serviceName, callback) {
	functionite()
	.to(getAllServices)
	.to(getAddressesFromService, serviceName)
	.then(function (results) {
		callback(results[0]);
	});
}

/** HELPER FUNCTIONS **/

//get all nodes in Consul
function getNodes (callback) {
	consul.catalog.node.list(function (err, results) {
		if (err) throw err;
		//parse out the node names
		var nodes = [];
		for (let i = 0; i < results.length; i++) {
			nodes.push(results[i]["Node"]);
		}
		callback(nodes);
	});
}

//get all running services managed by all the nodes supplied in the argument
function getServicesInNodes (nodes, callback) {
	var services = [];
	var nodeCount = nodes.length;
	for (let i in nodes) {
		consul.catalog.node.services(nodes[i], function (err, results) {
			if (err) throw err;
			let servicesTrim = trimServicesResponse(results);
			//append elements to final services array
			for (let j in servicesTrim) {
				services.push(servicesTrim[j]);
			}
			checkDone();
		});
	}
	function checkDone () {
		nodeCount--;
		if (nodeCount === 0) {
			callback(services);
		}
	}
}

//takes in the results of all services a node manages and trims them
//so that only an array of services remain. It makes an array, not an object
function trimServicesResponse (services) {
	services = services.Services; //discard Node information
	var flatServices = [];
	for (let property in services) {
		if (services.hasOwnProperty(property)) {
			//only push service information, and don't include the object name
			flatServices.push(services[property]);
		}
	}
	return flatServices;
}

//get IP and port info from all services with a certain name
function getAddressesFromService (services, serviceName, callback) {
	var addresses = [];
	//go through each running service and determine if it's the service we are looking for
	for (let i in services) {
		//get the service name of the object and compare to serviceName
		if (services[i]["Service"] === serviceName) {
			//it's the service we want. extract address info
			let address = {
				"ip": services[i]["Address"],
				"port": services[i]["Port"]
			}
			addresses.push(`${address.ip}:${address.port}`);
		}
	}
	callback(addresses);
}