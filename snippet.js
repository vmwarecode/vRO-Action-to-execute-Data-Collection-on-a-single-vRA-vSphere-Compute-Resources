//////////////////////////////////////////////////
//                    INPUTS                    //
//////////////////////////////////////////////////

/*

vcacHost (Type = vCAC:VCACHost)
vcacHostMachine (Type = vCAC:HostMachine)
dataCollectionType (Type = string)
waitForDataCollection (Type = boolean)
dataCollectionTimeOut (Type = number)
dataCollectionCheckInterval (Type = number)

*/

//////////////////////////////////////////////////
//                    OUTPUT                    //
//////////////////////////////////////////////////

/*

Return type = Properties

*/

//////////////////////////////////////////////////
//               OUTPUT STRUCTURE               //
//////////////////////////////////////////////////

/*

outputProperties.lastCollectionTime
outputProperties.collectionStartTime
outputProperties.lastCollectedStatus
outputProperties.errorCode = errorCode
outputProperties.errorMessage

*/

// Check if vCAC:HostMachine is managed by vRA
var managedByVra = vcacHostMachine.isVRMManaged;
if (managedByVra != true) {
	throw new Error(vcacHostMachine.hostName + " not managed by vRA");
}

var supportedDataCollectionTypes = ["inventory", "state", "performance"]
if (supportedDataCollectionTypes.indexOf(dataCollectionType) == -1) {
	throw new Error(dataCollectionType + " is not a supported Data Collection Type. Options are " + supportedDataCollectionTypes)	
}

var vcacHostMachineEntity = vcacHostMachine.getEntity();

var vcacAgentId = vcacHostMachineEntity.getLink(vcacHost, "Agent")[0].getProperty("AgentID")

var filterSpechFilter = "FilterSpecName eq 'vSphere' and FilterSpecGroup/FilterSpecGroupName eq '" + dataCollectionType + "'";

var filterSpecEntity = vCACEntityManager.readModelEntitiesBySystemQuery(vcacHost.id , "ManagementModelEntities.svc" , "FilterSpecs" , filterSpechFilter)[0]

var filterSpecId = filterSpecEntity.getProperty("FilterSpecID");

var dataCollectionStatusesFilter = "EntityID eq guid'" + vcacHostMachine.hostId + "' and Agent/AgentID eq guid'" + vcacAgentId + "' and FilterSpec/FilterSpecID eq guid'" + filterSpecId + "'";

var dataCollectionStatusEntity = vCACEntityManager.readModelEntitiesBySystemQuery(vcacHost.id , "ManagementModelEntities.svc" , "DataCollectionStatuses" , dataCollectionStatusesFilter)[0]

var dataCollectionStatusID = dataCollectionStatusEntity.getProperty("DataCollectionStatusID")
System.log("Executing Data Collection of type '" + dataCollectionType + "' for Compute Resource: " + vcacHostMachine.hostName)


var updateProperties = {
	"LastCollectedTime":null
};
	
vCACEntityManager.updateModelEntityBySerializedKey(vcacHost.id, "ManagementModelEntities.svc", "DataCollectionStatuses", dataCollectionStatusEntity.keyString, updateProperties, null, null);

System.log("Data Collection running....")

var dataCollectionStatusSearchProperties = new Properties();
dataCollectionStatusSearchProperties.DataCollectionStatusID = dataCollectionStatusID;

var dataCollectionStatusEntity = vCACEntityManager.readModelEntity(vcacHost.id, "ManagementModelEntities.svc", "DataCollectionStatuses", dataCollectionStatusSearchProperties, null);
var lastCollectedTime = dataCollectionStatusEntity.getProperty("LastCollectedTime");
var collectionStartTime = null;

var outputProperties = new Properties();

if (waitForDataCollection == true) {	
	var checkDate = new Date();
	checkDate.setSeconds(checkDate.getSeconds() + dataCollectionCheckInterval);
	
	var timeoutDate = new Date();
	timeoutDate.setMinutes(timeoutDate.getMinutes() + dataCollectionTimeOut);
	
	var dataCollectionTimedOut = false;
	
	while (lastCollectedTime == null) {
		
		var currentDate = new Date();
	
		// Check timeout
		if (currentDate.getTime() > timeoutDate.getTime()) {
			// Time Out reached
			dataCollectionTimedOut = true;
			break;
		}
		
		// Sleep if needed
		if (checkDate.getTime() > currentDate.getTime()) {
			System.waitUntil(checkDate, 5000);
		}
		
		var checkDate = new Date();
		checkDate.setSeconds(checkDate.getSeconds() + dataCollectionCheckInterval);
		
		var dataCollectionStatusEntity = vCACEntityManager.readModelEntity(vcacHost.id, "ManagementModelEntities.svc", "DataCollectionStatuses", dataCollectionStatusSearchProperties, null);
		lastCollectedTime = dataCollectionStatusEntity.getProperty("LastCollectedTime")
		
		var collectionStartTimeTemp = dataCollectionStatusEntity.getProperty("CollectionStartTime")
		if (collectionStartTimeTemp != null) {
			collectionStartTime = collectionStartTimeTemp;
		}
	
	}
	
	var dataCollectionStatusEntity = vCACEntityManager.readModelEntity(vcacHost.id, "ManagementModelEntities.svc", "DataCollectionStatuses", dataCollectionStatusSearchProperties, null);
	var lastCollectedTime = dataCollectionStatusEntity.getProperty("LastCollectedTime")
	var lastCollectedStatus = dataCollectionStatusEntity.getProperty("LastCollectedStatus")
	var errorCode = dataCollectionStatusEntity.getProperty("ErrorCode")
	var errorMessage = dataCollectionStatusEntity.getProperty("ErrorMessage")
	
}

if (waitForDataCollection == false) {
	System.log("Not waiting for completing of Data Collection")
	outputProperties.lastCollectionTime = null;
	outputProperties.collectionStartTime = collectionStartTime;
	outputProperties.lastCollectedStatus = false;
	outputProperties.errorCode = null;
	outputProperties.errorMessage = null;
} else if (dataCollectionTimedOut) {
	System.log("Data Collection timed out")
	outputProperties.lastCollectionTime = null;
	outputProperties.collectionStartTime = collectionStartTime;
	outputProperties.lastCollectedStatus = false;
	outputProperties.errorCode = null;
	outputProperties.errorMessage = "vRO timeout (" + dataCollectionTimeOut + " minutes) reached waiting for Data Collection to finish";
} else {
	System.log("Data Collection finished")
	outputProperties.lastCollectionTime = lastCollectedTime;
	outputProperties.collectionStartTime = collectionStartTime;
	outputProperties.lastCollectedStatus = lastCollectedStatus;
	outputProperties.errorCode = errorCode;
	outputProperties.errorMessage = errorMessage;
}

return outputProperties;