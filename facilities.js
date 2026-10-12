/**
 * NexusCampus OS - Facility Booking Module
 * Directly Connected to Backend Database Engine (/api/facilities, /api/facilities/book)
 */

window.NexusFacilities = (function() {
  let facilitiesData = [];
  let selectedFacility = null;

  // Fetch facilities from Backend Database
  async function loadFacilities() {
    try {
      const res = await fetch('/api/facilities');
      if (res.ok) {
        facilitiesData = await res.json();
      } else {
        throw new Error('Failed to fetch facilities');
      }
    } catch (e) {
      console.warn('Using local fallback for facilities:', e);
      if (facilitiesData.length === 0) {
        facilitiesData = [
          {
            id: 'c001',
            building_code: 'ROB-03',
            building_name: 'Turing Robotics Complex',
            name: 'Robotics Lab B - Autonomous Drones',
            type: 'lab',
            floor_number: 2,
            capacity: 28,
            status: 'occupied',
            current_co2_ppm: 445,
            current_temp_c: 21.8,
            amenities: ['Motion Capture Arena', '3D Printers', 'Soldering Stations', 'Wi-Fi 7']
          },
          {
            id: 'c002',
            building_code: 'ROB-03',
            building_name: 'Turing Robotics Complex',
            name: 'Cyber Defense Simulation Arena',
            type: 'lab',
            floor_number: 3,
            capacity: 40,
            status: 'available',
            current_co2_ppm: 390,
            current_temp_c: 20.5,
            amenities: ['Isolated Subnet', 'Air-Gapped Racks', 'Dual 4K Displays']
          },
          {
            id: 'c003',
            building_code: 'LIB-01',
            building_name: 'Cyber Commons & Library',
            name: 'Quiet Study Pod 104',
            type: 'study_room',
            floor_number: 1,
            capacity: 6,
            status: 'available',
            current_co2_ppm: 380,
            current_temp_c: 22.0,
            amenities: ['Acoustic Panels', 'Whiteboard', 'Smart TV Screen']
          },
          {
            id: 'c004',
            building_code: 'LIB-01',
            building_name: 'Cyber Commons & Library',
            name: 'Collaborative Think Tank Hall A',
            type: 'hall',
            floor_number: 2,
            capacity: 85,
            status: 'occupied',
            current_co2_ppm: 510,
            current_temp_c: 23.2,
            amenities: ['Surround Audio System', 'Dual Laser Projectors']
          },
          {
            id: 'c005',
            building_code: 'SCI-02',
            building_name: 'Quantum Computing Laboratory',
            name: 'Cryogenic Quantum Computing Pod',
            type: 'lab',
            floor_number: 1,
            capacity: 12,
            status: 'maintenance',
            current_co2_ppm: 415,
            current_temp_c: 18.0,
            amenities: ['Dilution Fridge Telemetry', 'Cleanroom Garments']
          },
          {
            id: 'c006',
            building_code: 'ENG-01',
            building_name: 'Main Engineering & Transit Hub',
            name: 'Executive Cyber Governance Boardroom',
            type: 'conference',
            floor_number: 4,
            capacity: 22,
            status: 'available',
            current_co2_ppm: 395,
            current_temp_c: 21.0,
            amenities: ['Cisco Webex Telepresence', 'Automated Privacy Glass']
          }
        ];
      }
    }
    renderFacilities();
  }

  // Render Facilities Cards
  function renderFacilities() {
    const grid = document.getElementById('facilities-grid-container');
    if (!grid) return;

    const typeFilter = document.getElementById('facility-type-filter')?.value || 'all';
    const statusFilter = document.getElementById('facility-status-filter')?.value || 'all';

    const filtered = facilitiesData.filter(f => {
      if (typeFilter !== 'all' && f.type !== typeFilter) return false;
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      return true;
    });

    grid.innerHTML = '';

    filtered.forEach(facility => {
      const card = document.createElement('div');
      card.className = 'glass-panel facility-card';

      let statusClass = 'available';
      if (facility.status === 'occupied') statusClass = 'occupied';
      if (facility.status === 'maintenance') statusClass = 'maintenance';

      const bCode = facility.building_code || facility.buildingCode || 'BLD';
      const bName = facility.building_name || facility.buildingName || 'Campus Complex';
      const floor = facility.floor_number !== undefined ? facility.floor_number : facility.floor;
      const co2 = facility.current_co2_ppm || facility.co2 || 410;
      const temp = facility.current_temp_c || facility.temp || 21.0;
      const amenitiesList = Array.isArray(facility.amenities) ? facility.amenities : [];

      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <span style="font-size: 0.72rem; color: var(--cyan-light); font-weight: 700;">
              ${bCode} • Floor ${floor}
            </span>
            <span class="facility-status-badge ${statusClass}">
              ● ${facility.status.toUpperCase()}
            </span>
          </div>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin-bottom: 6px;">${facility.name}</h4>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">${bName}</p>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.78rem; background: rgba(3,7,18,0.5); padding: 10px; border-radius: 8px; border: 1px solid rgba(51,65,85,0.4); margin-bottom: 14px;">
            <div>👥 <b>Cap:</b> ${facility.capacity} pax</div>
            <div>🏷️ <b>Type:</b> ${facility.type.toUpperCase()}</div>
            <div>🍃 <b>CO2:</b> ${co2} ppm</div>
            <div>🌡️ <b>Temp:</b> ${temp}°C</div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 14px;">
            ${amenitiesList.map(a => `<span style="font-size: 0.68rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 2px 7px; border-radius: 4px; color: #cbd5e1;">${a}</span>`).join('')}
          </div>
        </div>

        <div>
          ${facility.status === 'available' ? `
            <button onclick="NexusFacilities.openBookingModal('${facility.id}')" class="btn-primary" style="width: 100%;">
              ⚡ Reserve Facility
            </button>
          ` : facility.status === 'occupied' ? `
            <button class="btn-secondary" style="width: 100%; opacity: 0.6; cursor: not-allowed;" disabled>
              🔒 Currently Occupied (In Use)
            </button>
          ` : `
            <button class="btn-secondary" style="width: 100%; opacity: 0.6; cursor: not-allowed;" disabled>
              ⚠️ Under Scheduled Maintenance
            </button>
          `}
        </div>
      `;

      grid.appendChild(card);
    });
  }

  function openBookingModal(facilityId) {
    const facility = facilitiesData.find(f => f.id === facilityId);
    if (!facility) return;
    selectedFacility = facility;

    const modal = document.getElementById('booking-reservation-modal');
    const targetName = document.getElementById('booking-target-facility-name');
    const targetCap = document.getElementById('booking-target-capacity');

    if (targetName) targetName.textContent = facility.name;
    if (targetCap) targetCap.textContent = `${facility.capacity} seats max`;

    if (modal) modal.classList.add('open');
    window.NexusApp.playSound('click');
  }

  function closeBookingModal() {
    const modal = document.getElementById('booking-reservation-modal');
    if (modal) modal.classList.remove('open');
    selectedFacility = null;
    window.NexusApp.playSound('click');
  }

  // Confirm Reservation & Persist to Backend Database
  async function confirmBooking() {
    if (!selectedFacility) return;

    const attendeeCountInput = document.getElementById('booking-attendee-count');
    const attendees = parseInt(attendeeCountInput?.value || 1, 10);

    if (attendees > selectedFacility.capacity) {
      window.NexusApp.showToast(`Error: Attendee count (${attendees}) exceeds maximum capacity (${selectedFacility.capacity})!`, 'error');
      window.NexusApp.playSound('alarm');
      return;
    }

    try {
      const res = await fetch('/api/facilities/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facility_id: selectedFacility.id,
          attendees: attendees
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking error');

      selectedFacility.status = 'occupied';
      renderFacilities();
      closeBookingModal();

      const currentUser = window.NexusApp.state.currentUser;
      window.NexusApp.showToast(`Reservation Persisted to Database for ${selectedFacility.name}!`, 'success');
      window.NexusTelemetry.appendLogEntry('FAC-BOOK', `Database committed: Reserved ${selectedFacility.name} for ${currentUser.name}.`, 'success');
      window.NexusApp.playSound('success');

      // Reload fresh list from DB
      loadFacilities();
    } catch (err) {
      window.NexusApp.showToast(`Booking Failed: ${err.message}`, 'error');
    }
  }

  function init() {
    loadFacilities();

    const typeFilter = document.getElementById('facility-type-filter');
    if (typeFilter) typeFilter.addEventListener('change', renderFacilities);

    const statusFilter = document.getElementById('facility-status-filter');
    if (statusFilter) statusFilter.addEventListener('change', renderFacilities);

    const btnClose = document.getElementById('btn-close-booking-modal');
    if (btnClose) btnClose.addEventListener('click', closeBookingModal);

    const btnConfirm = document.getElementById('btn-confirm-reservation');
    if (btnConfirm) btnConfirm.addEventListener('click', confirmBooking);
  }

  return {
    facilitiesData,
    init,
    loadFacilities,
    renderFacilities,
    openBookingModal,
    closeBookingModal,
    confirmBooking
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.NexusFacilities.init();
});
