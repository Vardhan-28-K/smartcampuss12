/**
 * NexusCampus OS - Module C: Geospatial GIS & Multi-Floor Campus Map
 * Leaflet Dark Vector Layout, Custom POI Radar Pins, Multi-Floor Plan Switcher,
 * Step-Free Accessibility Toggle, A* Pathfinding Route Visualizer
 */

window.NexusMap = (function() {
  const state = {
    mapInstance: null,
    currentFloor: 0, // 0 = Ground, 1 = Floor 1, 2 = Floor 2, 3 = Floor 3
    stepFreeOnly: false,
    activeRoutePolyline: null,
    routeAnimFrame: null,
    markers: [],
    floorOverlays: []
  };

  // Campus Graph Nodes for A* Pathfinding
  // Includes coordinates, floor levels, accessible tags (hasElevator / rampOnly)
  const campusGraph = {
    nodes: {
      'gate-main': { id: 'gate-main', name: 'Main Security Gate', lat: 37.7758, lng: -122.4190, floor: 0, accessible: true },
      'transit-hub': { id: 'transit-hub', name: 'West Autonomous Transit Hub', lat: 37.7762, lng: -122.4208, floor: 0, accessible: true },
      'quad-plaza': { id: 'quad-plaza', name: 'Central Cyber Quad Plaza', lat: 37.7750, lng: -122.4195, floor: 0, accessible: true },
      'quad-stairs': { id: 'quad-stairs', name: 'Terrace Stepped Walkway (Stairs)', lat: 37.7748, lng: -122.4192, floor: 0, accessible: false }, // Not accessible!
      'quad-ramp': { id: 'quad-ramp', name: 'Accessible South Ramp', lat: 37.7749, lng: -122.4190, floor: 0, accessible: true },
      'library-g': { id: 'library-g', name: 'Central Library - Ground Foyer', lat: 37.7752, lng: -122.4205, floor: 0, accessible: true },
      'library-f1': { id: 'library-f1', name: 'Library Floor 1 - Quiet Study Pods', lat: 37.7752, lng: -122.4205, floor: 1, accessible: true },
      'robotics-g': { id: 'robotics-g', name: 'Turing Robotics Complex - Foyer', lat: 37.7745, lng: -122.4182, floor: 0, accessible: true },
      'robotics-f2': { id: 'robotics-f2', name: 'Robotics Lab B - Drones', lat: 37.7745, lng: -122.4182, floor: 2, accessible: true },
      'quantum-lab': { id: 'quantum-lab', name: 'Quantum Computing Laboratory', lat: 37.7740, lng: -122.4200, floor: 0, accessible: true },
      'bistro-404': { id: 'bistro-404', name: 'Bistro 404 & Dining Commons', lat: 37.7735, lng: -122.4192, floor: 0, accessible: true }
    },
    edges: [
      // Main Gate connections
      { from: 'gate-main', to: 'quad-plaza', dist: 110, stairs: false },
      { from: 'gate-main', to: 'transit-hub', dist: 160, stairs: false },
      { from: 'gate-main', to: 'robotics-g', dist: 170, stairs: false },

      // Transit Hub connections
      { from: 'transit-hub', to: 'library-g', dist: 120, stairs: false },
      { from: 'transit-hub', to: 'quad-plaza', dist: 175, stairs: false },

      // Library connections
      { from: 'library-g', to: 'quad-plaza', dist: 95, stairs: false },
      { from: 'library-g', to: 'library-f1', dist: 30, stairs: true, hasElevator: true },
      { from: 'library-g', to: 'quantum-lab', dist: 140, stairs: false },

      // Quad Plaza to South Area (Direct stairs vs slightly longer ramp)
      { from: 'quad-plaza', to: 'quad-stairs', dist: 35, stairs: true },
      { from: 'quad-plaza', to: 'quad-ramp', dist: 65, stairs: false },

      { from: 'quad-stairs', to: 'robotics-g', dist: 80, stairs: true },
      { from: 'quad-ramp', to: 'robotics-g', dist: 95, stairs: false },

      { from: 'quad-stairs', to: 'bistro-404', dist: 130, stairs: false },
      { from: 'quad-ramp', to: 'bistro-404', dist: 145, stairs: false },

      // Robotics internal
      { from: 'robotics-g', to: 'robotics-f2', dist: 60, stairs: true, hasElevator: true },
      { from: 'robotics-g', to: 'bistro-404', dist: 140, stairs: false },

      // Quantum Lab
      { from: 'quantum-lab', to: 'bistro-404', dist: 90, stairs: false },
      { from: 'quantum-lab', to: 'quad-ramp', dist: 125, stairs: false }
    ]
  };

  // POI Markers Data with environmental telemetry
  const poiList = [
    {
      id: 'gate-main',
      name: 'Main Security Gate & Turnstiles',
      code: 'GATE-01',
      type: 'Security',
      lat: 37.7758,
      lng: -122.4190,
      floor: 0,
      icon: '🛡️',
      color: '#06b6d4',
      occupancy: '92 p/hr',
      temp: '20.1°C',
      co2: '410 ppm'
    },
    {
      id: 'robotics-f2',
      name: 'Turing Robotics & AI Lab B',
      code: 'ROB-03',
      type: 'Laboratory',
      lat: 37.7745,
      lng: -122.4182,
      floor: 2,
      icon: '🤖',
      color: '#22d3ee',
      occupancy: '82% (28/34)',
      temp: '21.8°C',
      co2: '445 ppm'
    },
    {
      id: 'library-g',
      name: 'Central Library & Cyber Commons',
      code: 'LIB-01',
      type: 'Study Space',
      lat: 37.7752,
      lng: -122.4205,
      floor: 0,
      icon: '📚',
      color: '#10b981',
      occupancy: '68% (120/180)',
      temp: '21.5°C',
      co2: '390 ppm'
    },
    {
      id: 'quantum-lab',
      name: 'Quantum Computing Laboratory',
      code: 'SCI-02',
      type: 'High-Sec Lab',
      lat: 37.7740,
      lng: -122.4200,
      floor: 0,
      icon: '🔬',
      color: '#818cf8',
      occupancy: '91% (12/14)',
      temp: '18.4°C',
      co2: '415 ppm'
    },
    {
      id: 'bistro-404',
      name: 'Bistro 404 & Dining Commons',
      code: 'DIN-01',
      type: 'Cafeteria',
      lat: 37.7735,
      lng: -122.4192,
      floor: 0,
      icon: '☕',
      color: '#f59e0b',
      occupancy: '74% (148/200)',
      temp: '23.0°C',
      co2: '480 ppm'
    },
    {
      id: 'transit-hub',
      name: 'West Autonomous Transit Hub',
      code: 'TRN-01',
      type: 'Transit',
      lat: 37.7762,
      lng: -122.4208,
      floor: 0,
      icon: '🚆',
      color: '#34d399',
      occupancy: 'High Throughput',
      temp: '19.8°C',
      co2: '418 ppm'
    }
  ];

  // Initialize Leaflet Map
  function initMap() {
    const mapElement = document.getElementById('campus-map-element');
    if (!mapElement) return;

    if (typeof L === 'undefined') {
      console.warn('Leaflet not loaded, rendering fallback vector canvas.');
      return;
    }

    // Default center: Campus Center
    state.mapInstance = L.map('campus-map-element', {
      center: [37.7749, -122.4194],
      zoom: 17,
      zoomControl: true,
      attributionControl: false
    });

    // Dark Matter tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(state.mapInstance);

    // Draw campus boundary polygon with neon glow
    const campusBounds = [
      [37.7766, -122.4215],
      [37.7766, -122.4175],
      [37.7730, -122.4175],
      [37.7730, -122.4215]
    ];

    L.polygon(campusBounds, {
      color: '#06b6d4',
      weight: 1.5,
      opacity: 0.6,
      fillColor: '#030712',
      fillOpacity: 0.15,
      dashArray: '4, 4'
    }).addTo(state.mapInstance);

    // Render POI Radar Markers
    renderPoiMarkers();

    // Render Indoor Floor Polygons
    renderFloorPlan();
  }

  // Render Custom Glowing POI Radar Markers
  function renderPoiMarkers() {
    if (!state.mapInstance) return;

    // Remove existing markers
    state.markers.forEach(m => state.mapInstance.removeLayer(m));
    state.markers = [];

    poiList.forEach(poi => {
      // Create custom DivIcon
      const iconHtml = `
        <div style="
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          cursor: pointer;
        ">
          <div style="
            position: absolute;
            inset: 0;
            border-radius: 50%;
            background: ${poi.color};
            opacity: 0.25;
            animation: pulseNeon 2s infinite;
          "></div>
          <div style="
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: rgba(11, 19, 41, 0.95);
            border: 2px solid ${poi.color};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            box-shadow: 0 0 12px ${poi.color};
            z-index: 2;
          ">
            ${poi.icon}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-poi-marker',
        html: iconHtml,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });

      const marker = L.marker([poi.lat, poi.lng], { icon: customIcon }).addTo(state.mapInstance);

      // Glassmorphic Cyber Popup
      const popupHtml = `
        <div style="
          background: #0b1329;
          color: #f8fafc;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid ${poi.color};
          box-shadow: 0 10px 25px rgba(0,0,0,0.7);
          font-family: 'Inter', sans-serif;
          min-width: 220px;
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 700; color: ${poi.color}; text-transform: uppercase;">${poi.code} • ${poi.type}</span>
            <span style="font-size: 10px; color: #94a3b8;">Floor ${poi.floor}</span>
          </div>
          <div style="font-size: 13px; font-weight: 700; margin-bottom: 8px; color: #fff;">${poi.name}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; margin-bottom: 10px; color: #cbd5e1;">
            <div>👥 <b>Occ:</b> ${poi.occupancy}</div>
            <div>🌡️ <b>Temp:</b> ${poi.temp}</div>
            <div style="grid-column: span 2;">🍃 <b>Air:</b> ${poi.co2} (Nominal)</div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button onclick="NexusMap.setRouteOrigin('${poi.id}')" style="
              flex: 1; padding: 5px 8px; font-size: 10px; font-weight: 600;
              background: rgba(6,182,212,0.2); border: 1px solid #06b6d4; color: #22d3ee;
              border-radius: 6px; cursor: pointer;
            ">Set Origin</button>
            <button onclick="NexusMap.setRouteDestination('${poi.id}')" style="
              flex: 1; padding: 5px 8px; font-size: 10px; font-weight: 600;
              background: rgba(16,185,129,0.2); border: 1px solid #10b981; color: #34d399;
              border-radius: 6px; cursor: pointer;
            ">Set Dest</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: 'cyber-leaflet-popup',
        closeButton: false
      });

      state.markers.push(marker);
    });
  }

  // Floor Plan Switcher (Ground, Floor 1, Floor 2, Floor 3)
  function switchFloor(floorNum) {
    state.currentFloor = floorNum;

    // Update buttons
    document.querySelectorAll('.floor-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.floor, 10) === floorNum);
    });

    renderFloorPlan();
    window.NexusApp.playSound('click');
    window.NexusApp.showToast(`Switched map perspective to Floor ${floorNum === 0 ? 'Ground (0)' : floorNum}`, 'info');
  }

  // Render Indoor Floor Polygons and Rooms
  function renderFloorPlan() {
    if (!state.mapInstance) return;

    // Remove old floor layers
    state.floorOverlays.forEach(layer => state.mapInstance.removeLayer(layer));
    state.floorOverlays = [];

    // Different rooms highlighted based on floor
    if (state.currentFloor === 2) {
      // Highlight Floor 2 Robotics Lab
      const robPolygon = L.polygon([
        [37.7747, -122.4184],
        [37.7747, -122.4180],
        [37.7743, -122.4180],
        [37.7743, -122.4184]
      ], {
        color: '#22d3ee',
        weight: 2,
        fillColor: '#06b6d4',
        fillOpacity: 0.35
      }).addTo(state.mapInstance);

      robPolygon.bindTooltip("Floor 2: Robotics Lab B [Active Occupancy]", { permanent: true, direction: "center", className: "cyber-tooltip" });
      state.floorOverlays.push(robPolygon);
    } else if (state.currentFloor === 1) {
      // Highlight Floor 1 Library Quiet Pods
      const libPolygon = L.polygon([
        [37.7754, -122.4207],
        [37.7754, -122.4203],
        [37.7750, -122.4203],
        [37.7750, -122.4207]
      ], {
        color: '#10b981',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.35
      }).addTo(state.mapInstance);

      libPolygon.bindTooltip("Floor 1: Quiet Study Pods [Available]", { permanent: true, direction: "center", className: "cyber-tooltip" });
      state.floorOverlays.push(libPolygon);
    }
  }

  // Step-Free Accessibility Toggle
  function toggleStepFree(enabled) {
    state.stepFreeOnly = enabled;
    window.NexusApp.showToast(
      enabled ? '♿ Step-Free Mode: Prioritizing elevators, wide corridors & ramps' : 'Standard Routing: Multi-level stairs allowed',
      'info'
    );
    // Recalculate route if already plotted
    calculateAndDrawRoute();
  }

  // A* / Dijkstra Shortest Path Algorithm
  function findPath(originId, destId, stepFreeOnly) {
    const nodes = campusGraph.nodes;
    const edges = campusGraph.edges;

    if (!nodes[originId] || !nodes[destId]) return null;

    // Distances map
    const dist = {};
    const prev = {};
    const unvisited = new Set(Object.keys(nodes));

    Object.keys(nodes).forEach(n => dist[n] = Infinity);
    dist[originId] = 0;

    while (unvisited.size > 0) {
      // Find min dist node in unvisited
      let curr = null;
      let minDist = Infinity;
      unvisited.forEach(nodeId => {
        if (dist[nodeId] < minDist) {
          minDist = dist[nodeId];
          curr = nodeId;
        }
      });

      if (!curr || minDist === Infinity || curr === destId) break;
      unvisited.delete(curr);

      // Find neighbors
      const neighbors = edges.filter(e => e.from === curr || e.to === curr);
      neighbors.forEach(edge => {
        const neighborId = edge.from === curr ? edge.to : edge.from;
        if (!unvisited.has(neighborId)) return;

        // Check accessibility constraint
        if (stepFreeOnly && edge.stairs && !edge.hasElevator) {
          return; // Skip stairs!
        }

        const alt = dist[curr] + edge.dist;
        if (alt < dist[neighborId]) {
          dist[neighborId] = alt;
          prev[neighborId] = curr;
        }
      });
    }

    // Reconstruct path
    const path = [];
    let u = destId;
    if (!prev[u] && u !== originId) return null; // No path found

    while (u) {
      path.unshift(u);
      u = prev[u];
    }

    return {
      path,
      totalDistance: dist[destId]
    };
  }

  // Calculate and Draw Glowing Route on Map
  function calculateAndDrawRoute() {
    const originSelect = document.getElementById('route-origin-select');
    const destSelect = document.getElementById('route-dest-select');
    if (!originSelect || !destSelect) return;

    const origin = originSelect.value;
    const dest = destSelect.value;

    if (origin === dest) {
      window.NexusApp.showToast('Origin and Destination cannot be the same location.', 'warning');
      return;
    }

    const result = findPath(origin, dest, state.stepFreeOnly);
    const telemetryResult = document.getElementById('route-result-telemetry');

    if (!result || !result.path || result.path.length < 2) {
      window.NexusApp.showToast('No accessible route found matching parameters.', 'error');
      if (telemetryResult) telemetryResult.style.display = 'none';
      return;
    }

    const { path, totalDistance } = result;

    // Calculate time & steps
    // Average walking speed: 80 m/min (step-free slightly adjusted to 70 m/min)
    const speed = state.stepFreeOnly ? 70 : 80;
    const walkMinutes = (totalDistance / speed).toFixed(1);
    const stepCount = Math.round(totalDistance * 1.35);

    // Update UI Stats
    if (telemetryResult) {
      telemetryResult.style.display = 'flex';
      const elDist = document.getElementById('route-stat-distance');
      if (elDist) elDist.textContent = `${totalDistance} m`;

      const elTime = document.getElementById('route-stat-time');
      if (elTime) elTime.textContent = `${walkMinutes} min`;

      const elSteps = document.getElementById('route-stat-steps');
      if (elSteps) elSteps.textContent = `${stepCount}`;

      const elAccess = document.getElementById('route-stat-access');
      if (elAccess) {
        elAccess.innerHTML = state.stepFreeOnly
          ? '<span style="color: #34d399;">♿ 100% Step-Free Verified</span>'
          : '<span style="color: #22d3ee;">Standard Path (Walkway)</span>';
      }
    }

    // Draw on Leaflet Map
    if (state.mapInstance) {
      if (state.activeRoutePolyline) {
        state.mapInstance.removeLayer(state.activeRoutePolyline);
      }

      const latLngs = path.map(nodeId => {
        const node = campusGraph.nodes[nodeId];
        return [node.lat, node.lng];
      });

      // Animated glowing cyber polyline
      state.activeRoutePolyline = L.polyline(latLngs, {
        color: state.stepFreeOnly ? '#34d399' : '#22d3ee',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: '10, 10',
        dashOffset: '0'
      }).addTo(state.mapInstance);

      // Fit bounds
      state.mapInstance.fitBounds(state.activeRoutePolyline.getBounds(), { padding: [50, 50] });

      window.NexusApp.playSound('scan');
      window.NexusApp.showToast(`Route Calculated: ${totalDistance}m (${walkMinutes} min)`, 'success');
    }
  }

  // Set Origin / Destination from POI popups
  function setRouteOrigin(id) {
    const select = document.getElementById('route-origin-select');
    if (select) {
      select.value = id;
      calculateAndDrawRoute();
    }
  }

  function setRouteDestination(id) {
    const select = document.getElementById('route-dest-select');
    if (select) {
      select.value = id;
      calculateAndDrawRoute();
    }
  }

  function init() {
    initMap();

    // Hook Floor Switchers
    document.querySelectorAll('.floor-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchFloor(parseInt(btn.dataset.floor, 10));
      });
    });

    // Hook Accessibility Toggle
    const accessToggle = document.getElementById('step-free-toggle');
    if (accessToggle) {
      accessToggle.addEventListener('change', (e) => {
        toggleStepFree(e.target.checked);
      });
    }

    // Hook Route Calculate Button
    const btnCalculate = document.getElementById('btn-calculate-route');
    if (btnCalculate) {
      btnCalculate.addEventListener('click', calculateAndDrawRoute);
    }
  }

  return {
    state,
    init,
    switchFloor,
    toggleStepFree,
    calculateAndDrawRoute,
    setRouteOrigin,
    setRouteDestination
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.NexusMap.init();
});
