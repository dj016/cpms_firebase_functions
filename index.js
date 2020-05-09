const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { messaging } = require("firebase-admin");
const { HttpsError } = require("firebase-functions/lib/providers/https");
admin.initializeApp();
const db = admin.firestore();

exports.startTrip = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called " + "while authenticated."
    );
  }
  const uid = context.auth.uid; // uid of the driver
  const uids = [];
  let MatchedRides = db.collection("MatchedRides");
  let query = MatchedRides.where("DriverId", "==", uid);
  try {
    const snapshots = await query.get();
    if (snapshots.empty) {
      console.log("In startRide no doc found where driverid = uid.");
      throw new functions.https.HttpsError(
        "In startRide no doc found where driverid = uid."
      );
    } else if (snapshots.size > 1) {
      console.log("Multiple files returned when only one file expected");
      throw new functions.https.HttpsError(
        "Multiple files returned when only one file expected"
      );
    }
    snapshots.forEach((element) => {
      element.data().PassengerIds.map((value) => uids.push(value));
    });
    uids.push(uid);
    let promises = [];
    uids.forEach((element) => {
      let p = db.doc(`user_notification_token/${element}`).get();
      promises.push(p);
    });
    const tokendocs = await Promise.all(promises);
    promises = [];
    tokendocs.forEach((element) => {
      const message = {
        notification: {
          title: "Carpool Ride Started",
          body:
            "Your Carpool ride has started. Hope you have an pleasant experience",
        },
        token: element.get("token"),
      };
      p = admin.messaging().send(message);
      promises.push(p);
    });
    const fcm_response = await Promise.all(promises);
    console.log("Ride end sucessfull:", fcm_response);
    return fcm_response;
  } catch (error) {
    console.log("Error sending start messages : ", error);
    throw new functions.https.HttpsError("Error sending start messages ");
  }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.endTrip = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called " + "while authenticated."
    );
  }
  const uid = context.auth.uid; // uid of the driver
  const uids = [];
  let MatchedRides = db.collection("MatchedRides");
  let query = MatchedRides.where("DriverId", "==", uid);
  try {
    const snapshots = await query.get();
    if (snapshots.empty) {
      console.log("In endRide no doc found where driverid = uid.");
      throw new functions.https.HttpsError(
        "In endRide no doc found where driverid = uid."
      );
    } else if (snapshots.size > 1) {
      console.log("Multiple files returned when only one file expected");
      throw new functions.https.HttpsError(
        "Multiple fies returned when only one file expected"
      );
    }
    snapshots.forEach((element) => {
      element.data().PassengerIds.map((value) => uids.push(value));
    });
    uids.push(uid);
    console.log("The number of uid's are ", uids.length);
    let promises = [];
    uids.forEach((element) => {
      const p = db.doc(`user_notification_token/${element}`).get();
      promises.push(p);
    });

    let deleteDoc = db
      .collection("MatchedRides")
      .doc(snapshots.docs[0].id)
      .delete();
    promises.push(deleteDoc);
    const tokendocs = await Promise.all(promises);
    promises = [];
    //console.log("The length of tokendocs is ", tokendocs.length);
    for (let index = 0; index < tokendocs.length - 1; index++) {
      const message = {
        notification: {
          title: "Carpool Ride Ended",
          body: "Your Carpool ride has ended. Thank you for using CPMS",
        },
        token: tokendocs[index].get("token"),
      };
      console.log("The token is ", tokendocs[index].get("token"));
      const p = admin.messaging().send(message);
      promises.push(p);
    }
    const fcm_response = await Promise.all(promises);
    console.log("Ride end sucessfull:", fcm_response);
    return fcm_response;
  } catch (error) {
    console.log("Error sending stop messages & deleting : ", error);
    throw new functions.https.HttpsError(
      "Error sending stop messages & deleting"
    );
  }
});

///////////////////////////////////////////////////////////////////////////////////////////
exports.fetchDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called " + "while authenticated."
    );
  }
  const uid = context.auth.uid;
  let MatchedRides = db.collection("MatchedRides");
  let query = MatchedRides.where("DriverId", "==", uid);
  let isDriver = true;
  let matchedRidesdoc;
  const result = {};
  try {
    const snapshots = await query.get();
    //console.log("The length of the first query ", snapshots.size);
    if (snapshots.empty) {
      // the caller is not a driver
      //console.log("The function caller is not a driver");
      isDriver = false;
      let query = MatchedRides.where("PassengerIds", "array-contains", uid);
      const p = await query.get();
      //console.log("The length of the second query ", p.size);
      if (p.empty) {
        console.log("No files received when a file was expecected");
        result.isValid = false;
        return JSON.stringify(result);
      } else if (p.size > 1) {
        console.log("Multiple files received when only one was expected");
        throw new functions.https.HttpsError(
          "Multiple fies received when one was expected"
        );
      } else {
        //console.log("The caller is an passenger confirmed!");
        matchedRidesdoc = p;
      }
    } else if (snapshots.size === 1) {
      // the caller is a driver
      //console.log("The caller is a driver");
      matchedRidesdoc = snapshots;
    } else {
      // multiple documents returned
      console.log("multiple files received when only one file was expected");
      throw new functions.https.HttpsError(
        "Multiple files received when only one file was expected"
      );
    }
    const uids = [];
    matchedRidesdoc.forEach((element) => {
      uids.push(element.data().DriverId);
      element.data().PassengerIds.forEach((passenger) => {
        uids.push(passenger);
      });
    });
    //now i will get the user data for all the uids
    const promises = [];
    uids.forEach((element) => {
      const p = db.doc(`users/${element}`).get();
      promises.push(p);
    });
    const p = await db.doc(`AllRides/${uid}/Rides/${matchedRidesdoc.id}`).get();
    promises.push(p);
    const documents = await Promise.all(promises);
    //console.log("The size of documents is " + documents.length);
    result.date = documents[documents.length - 1].get("date");
    result.time = documents[documents.length - 1].get("StartTime");
    //************************************ we can extract source and dest  from here */
    const driver = {};
    driver.name = documents[0].get("name");
    driver.phone = documents[0].get("phone");
    driver.uid = documents[0].get("uid");
    result.driver = driver;
    const passengers = [];
    for (let index = 1; index < documents.length - 1; index++) {
      const passenger_details = {};
      passenger_details.name = documents[index].get("name");
      passenger_details.phone = documents[index].get("phone");
      passenger_details.uid = documents[index].get("uid");
      passengers.push(passenger_details);
    }
    result.passengers = passengers;
    result.isDriver = isDriver;
    result.rideId = matchedRidesdoc.docs[0].id;
    result.isValid = true;
    const ans = JSON.stringify(result);
    console.log(ans);
    return JSON.stringify(result);
  } catch (error) {
    console.error(error);
    throw new functions.https.HttpsError("Error in fetching the data :", error);
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////

exports.createMatchedRides = functions.firestore
  .document("MatchedRides/{RideId}")
  .onCreate(async (snap, context) => {
    const RideId = context.params.RideId;
    const DriverId = snap.get("DriverId");
    const PassengerId = snap.get("PassengerIds");
    PassengerId.push(DriverId);
    let promises = [];
    PassengerId.forEach((passenger) => {
      const p1 = db.doc(`AllRides/${passenger}/Rides/${RideId}`).get();
      promises.push(p1);
      const p2 = db.doc(`user_notification_token/${passenger}`).get();
      promises.push(p2);
    });
    try {
      const firestoreResponses = await Promise.all(promises);
      const results = []; // stores all the data required
      for (let i = 0; i < firestoreResponses.length; i += 2) {
        let obj = {};
        obj.date = firestoreResponses[i].get("date");
        obj.time = firestoreResponses[i].get("StartTime");
        //************************we can extract latitudes and longitudes from here */
        obj.token = firestoreResponses[i + 1].get("token");
        results.push(obj);
      }
      promises = [];
      results.forEach((obj) => {
        const message = {
          notification: {
            title: "Upcoming Carpool Ride",
            body: `You have an upcoming carpool ride at date: ${obj.date} and time: ${obj.time}`,
          },
          token: obj.token,
        };
        const p = admin.messaging().send(message);
        promises.push(p);
      });
      const fcm_responses = await Promise.all(promises);
      console.log("Carpool creation notification sent successfully:", response);
      return fcm_responses;
    } catch (error) {
      console.log("Error sending carpool creation message: ", error);
      return error;
    }
  });
