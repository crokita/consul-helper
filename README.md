Do you have a Consul cluster running?

Do you have a local consul agent connected to the cluster?

Good. You can use this package.

This package is not meant for general use and is used specifically for Manticore

How can you use it? Like this:
```
//set up a watch for all services
var consuler = require('consul-helper')("127.0.0.1"); //ip that local consul agent binds to

//get a list of all services in the datacenter whenever a change in services is detected
consuler.watchServices(function (services) {
	//services updated. filter the information to a specific service
	let examples = services.filter("example-service");
	//now look through all the example-service services' information...
});

```