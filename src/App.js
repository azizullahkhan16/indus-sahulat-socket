import React, { useState, useEffect, useRef } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import "./App.css";

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [eventId, setEventId] = useState("1913238993801539584");
  const [event, setEvent] = useState(null);
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [admitRequests, setAdmitRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationError, setLocationError] = useState(null);
  const [userId] = useState("1912177586428452864"); // Matches JWT sub and patient.phone
  const stompClientRef = useRef(null);
  const notificationsEndRef = useRef(null);
  const token =
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiUk9MRV9QQVRJRU5UIiwic3ViIjoiKzkyMzAwMTIzNDU2NyIsImlhdCI6MTc0NDYxNTIzOH0.RsKkj8zQ2ctsgETjz1rsHCtxcEHEd2FQhT947o5IraY"; // Replace with dynamic token

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  const connect = () => {
    if (stompClientRef.current?.active) {
      console.log("STOMP client already active");
      return;
    }

    const socket = new SockJS(
      `${process.env.REACT_APP_SOCKET_URL}/chat?token=${token}`
    );
    stompClientRef.current = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: (str) => console.log(str),
    });

    stompClientRef.current.onConnect = (frame) => {
      console.log("Connected: ", frame);
      setIsConnected(true);
      setError(null);

      const subscriptionId = `event-${eventId}`;
      stompClientRef.current.subscribe(
        `/user/event/${eventId}`,
        (message) => {
          try {
            const eventData = JSON.parse(message.body);
            setEvent(eventData);
            console.log("Received event: ", eventData);
          } catch (error) {
            console.error("Failed to parse event: ", error);
            setError("Error receiving event data");
          }
        },
        { id: subscriptionId }
      );

      stompClientRef.current.subscribe(
        `/user/event/live-location/${eventId}`,
        (message) => {
          try {
            const location = JSON.parse(message.body);
            setEvent((prev) => ({
              ...prev,
              liveLocation: location,
            }));
            console.log("Received live location: ", location);
          } catch (error) {
            console.error("Failed to parse notification: ", error);
            setError("Error receiving notification");
          }
        },
        { id: `live-location-${eventId}` }
      );

      stompClientRef.current.subscribe(
        `/user/notification/${userId}`,
        (message) => {
          try {
            const notification = JSON.parse(message.body);
            console.log("Received notification: ", notification);
            setNotifications((prev) => [...prev, notification]);
            notificationsEndRef.current?.scrollIntoView({ behavior: "smooth" });
          } catch (error) {
            console.error("Failed to parse notification: ", error);
            setError("Error receiving notification");
          }
        },
        { id: `notification-${userId}` }
      );

      stompClientRef.current.subscribe(
        `/topic/ambulance-provider/active-incident/`,
        (message) => {
          try {
            const incidents = JSON.parse(message.body);
            setActiveIncidents(
              Array.isArray(incidents) ? incidents : [incidents]
            );
            console.log("Received active incidents: ", incidents);
          } catch (error) {
            console.error("Failed to parse active incidents: ", error);
            setError("Error receiving active incidents");
          }
        },
        { id: `active-incidents-${userId}` }
      );

      stompClientRef.current.subscribe(
        `/topic/hospital/admit-request/`,
        (message) => {
          try {
            const admitRequest = JSON.parse(message.body);
            setAdmitRequests((prev) => [...prev, admitRequest]);
            console.log("Received admit request: ", admitRequest);
          } catch (error) {
            console.error("Failed to parse admit request: ", error);
            setError("Error receiving admit request");
          }
        },
        { id: `admit-request-${userId}` }
      );
    };

    stompClientRef.current.onStompError = (frame) => {
      console.error("STOMP error: ", frame.headers["message"]);
      setIsConnected(false);
      setError("WebSocket connection failed");
      setTimeout(() => {
        if (!stompClientRef.current?.active) {
          connect();
        }
      }, 5000);
    };

    stompClientRef.current.onWebSocketClose = () => {
      console.log("WebSocket closed");
      setIsConnected(false);
      setError("WebSocket disconnected");
    };

    stompClientRef.current.onWebSocketError = (error) => {
      console.error("WebSocket error: ", error);
      setIsConnected(false);
      setError("WebSocket error occurred");
    };

    stompClientRef.current.activate();
  };

  const disconnect = () => {
    if (stompClientRef.current?.active) {
      stompClientRef.current.deactivate();
      console.log("Disconnected");
      setIsConnected(false);
      setEvent(null);
      setActiveIncidents([]);
      setAdmitRequests([]);
      setNotifications([]);
      setError(null);
      setLocationError(null);
    }
  };

  const reconnect = () => {
    disconnect();
    connect();
  };

  const handleLocationSubmit = (e) => {
    e.preventDefault();
    if (!stompClientRef.current?.active || !isConnected) {
      setError("Cannot send location: Not connected");
      return;
    }
    if (!event) {
      setError("No event joined to update location");
      return;
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setLocationError("Latitude must be between -90 and 90");
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setLocationError("Longitude must be between -180 and 180");
      return;
    }

    const location = { latitude: lat, longitude: lon };
    stompClientRef.current.publish({
      destination: `/app/event/live-location/${eventId}`,
      body: JSON.stringify(location),
    });
    console.log(`Sent location update for event ${event.id}: `, location);
    setLocationError(null);
    setError(null);
  };

  return (
    <div className="App">
      <h1>WebSocket Connection Status</h1>
      <p>
        <strong>User ID:</strong> {userId || "N/A"}
      </p>
      <p>
        <strong>Event ID:</strong> {eventId || "N/A"}
      </p>
      <p>{isConnected ? "Connected" : "Disconnected"}</p>
      {error && <p className="error">{error}</p>}
      <button onClick={reconnect} disabled={isConnected}>
        Reconnect
      </button>

      <div className="event-details">
        <h2>Event Details</h2>
        {event ? (
          <div className="event-card">
            <h3>Event ID: {event.id}</h3>
            <p>
              <strong>Status:</strong> {event.status || "N/A"}
            </p>
            <p>
              <strong>Live Location:</strong>{" "}
              {event.liveLocation
                ? `Lat: ${event.liveLocation.latitude}, Lon: ${event.liveLocation.longitude}`
                : "N/A"}
            </p>
            <p>
              <strong>Patient:</strong>{" "}
              {event.patient
                ? `${event.patient.firstName} ${event.patient.lastName}`
                : "N/A"}
            </p>
            <p>
              <strong>Pickup Address:</strong> {event.pickupAddress || "N/A"}
            </p>
            <p>
              <strong>Pickup Location:</strong>{" "}
              {event.pickupLocation
                ? `Lat: ${event.pickupLocation.latitude}, Lon: ${event.pickupLocation.longitude}`
                : "N/A"}
            </p>
            <p>
              <strong>Created At:</strong>{" "}
              {event.createdAt
                ? new Date(event.createdAt).toLocaleString()
                : "N/A"}
            </p>
            <p>
              <strong>Updated At:</strong>{" "}
              {event.updatedAt
                ? new Date(event.updatedAt).toLocaleString()
                : "N/A"}
            </p>

            <div className="location-update">
              <h3>Update Live Location</h3>
              <form onSubmit={handleLocationSubmit}>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Latitude (-90 to 90)"
                  disabled={!isConnected}
                />
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude (-180 to 180)"
                  disabled={!isConnected}
                />
                {locationError && <p className="error">{locationError}</p>}
                <button
                  type="submit"
                  disabled={!isConnected || !latitude || !longitude}
                >
                  Send Location
                </button>
              </form>
            </div>
          </div>
        ) : (
          <p>No event joined yet.</p>
        )}
      </div>

      <div className="active-incidents">
        <h2>Active Incidents</h2>
        {activeIncidents.length > 0 ? (
          <ul className="incident-list">
            {activeIncidents.map((incident, index) => (
              <li key={incident.id || index} className="incident-item">
                <p>
                  <strong>Incident ID:</strong> {incident.id || "N/A"}
                </p>
                <p>
                  <strong>Status:</strong> {incident.status || "N/A"}
                </p>
                <p>
                  <strong>Patient:</strong>{" "}
                  {incident.patient
                    ? `${incident.patient.firstName} ${incident.patient.lastName}`
                    : "N/A"}
                </p>
                <p>
                  <strong>Pickup Address:</strong>{" "}
                  {incident.pickupAddress || "N/A"}
                </p>
                <p>
                  <strong>Pickup Location:</strong>{" "}
                  {incident.pickupLocation
                    ? `Lat: ${incident.pickupLocation.latitude}, Lon: ${incident.pickupLocation.longitude}`
                    : "N/A"}
                </p>
                <p>
                  <strong>Created At:</strong>{" "}
                  {incident.createdAt
                    ? new Date(incident.createdAt).toLocaleString()
                    : "N/A"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No active incidents available.</p>
        )}
      </div>

      <div className="admit-requests">
        <h2>Admit Requests</h2>
        {admitRequests.length > 0 ? (
          <ul className="admit-request-list">
            {admitRequests.map((request, index) => (
              <li
                key={request.eventHospitalAssignment?.id || index}
                className="admit-request-item"
              >
                <p>
                  <strong>Event ID:</strong> {request.event?.id || "N/A"}
                </p>
                <p>
                  <strong>Patient:</strong>{" "}
                  {request.event?.patient
                    ? `${request.event.patient.firstName} ${request.event.patient.lastName}`
                    : "N/A"}
                </p>
                <p>
                  <strong>Hospital:</strong>{" "}
                  {request.eventHospitalAssignment?.hospital?.name || "N/A"}
                </p>
                <p>
                  <strong>Hospital Location:</strong>{" "}
                  {request.eventHospitalAssignment?.hospital?.address
                    ? `Lat: ${request.eventHospitalAssignment.hospital.address.latitude}, Lon: ${request.eventHospitalAssignment.hospital.address.longitude}`
                    : "N/A"}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  {request.eventHospitalAssignment?.status || "N/A"}
                </p>
                <p>
                  <strong>Ambulance:</strong>{" "}
                  {request.event?.eventAmbulanceAssignment?.ambulanceAssignment
                    ?.ambulance
                    ? `${request.event.eventAmbulanceAssignment.ambulanceAssignment.ambulance.make} ${request.event.eventAmbulanceAssignment.ambulanceAssignment.ambulance.model}`
                    : "N/A"}
                </p>
                <p>
                  <strong>Created At:</strong>{" "}
                  {request.eventHospitalAssignment?.createdAt
                    ? new Date(
                        request.eventHospitalAssignment.createdAt
                      ).toLocaleString()
                    : "N/A"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No admit requests received.</p>
        )}
      </div>

      <div className="notifications">
        <h2>Notifications</h2>
        {notifications.length > 0 ? (
          <ul className="notification-list">
            {notifications.map((notification, index) => (
              <li key={index} className="notification-item">
                <p>
                  <strong>Notification Type:</strong>{" "}
                  {notification.notificationType || "N/A"}
                </p>
                <p>
                  <strong>Receiver Id:</strong>{" "}
                  {notification.receiverId || "N/A"}
                </p>
                <p>
                  <strong>Receiver Type:</strong>{" "}
                  {notification.receiverType || "N/A"}
                </p>
                <p>
                  <strong>Time:</strong>{" "}
                  {notification.timestamp
                    ? new Date(notification.createdAt).toLocaleString()
                    : "N/A"}
                </p>
              </li>
            ))}
            <div ref={notificationsEndRef} />
          </ul>
        ) : (
          <p>No notifications received.</p>
        )}
      </div>
    </div>
  );
}

export default App;
