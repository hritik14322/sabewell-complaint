import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// ----------------------------------------------------
// 🗄️ Mock Database Seed Data
// ----------------------------------------------------
const MOCK_COMPLAINTS_SEED = [
  {
    complaint_id: "620260001",
    name: "Rajesh Kumar",
    address: "Street No. 3, Block B, Preet Vihar",
    phone: "+919876543210",
    village: "",
    city: "New Delhi",
    district: "East Delhi",
    state: "Delhi",
    pincode: "110092",
    invoice_number: "INV-2026-001",
    product_details: "Sabewell Air Cooler 50L",
    product_serial: "SBW-AC50-9988",
    issue_description: "Water pump is making a loud rattling sound and not cooling properly.",
    date: "2026-06-01",
    status: "Pending",
    warranty: "Warranted",
    status_history: [
      { status: "Pending", note: "Complaint registered", at: "2026-06-01T10:00:00Z" }
    ],
    photos: [],
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-01T10:00:00Z"
  },
  {
    complaint_id: "620260002",
    name: "Sunita Sharma",
    address: "Flat 402, Royal Palms Apartments, Andheri East",
    phone: "+919811223344",
    village: "",
    city: "Mumbai",
    district: "Mumbai Suburban",
    state: "Maharashtra",
    pincode: "400069",
    invoice_number: "INV-2026-042",
    product_details: "Sabewell Tower Fan",
    product_serial: "SBW-TF-1122",
    issue_description: "Fan oscillation stopped working after two weeks of use.",
    date: "2026-06-03",
    status: "In Progress",
    warranty: "Warranted",
    status_history: [
      { status: "Pending", note: "Complaint registered", at: "2026-06-03T09:15:00Z" },
      { status: "In Progress", note: "Technician assigned, visiting tomorrow", at: "2026-06-04T14:30:00Z" }
    ],
    photos: [],
    created_at: "2026-06-03T09:15:00Z",
    updated_at: "2026-06-04T14:30:00Z"
  },
  {
    complaint_id: "620260003",
    name: "Anil Patel",
    address: "12, Shanti Nagar, Near Railway Station",
    phone: "+919427011223",
    village: "",
    city: "Ahmedabad",
    district: "Ahmedabad",
    state: "Gujarat",
    pincode: "380001",
    invoice_number: "INV-2026-105",
    product_details: "Sabewell Air Cooler 75L",
    product_serial: "SBW-AC75-8833",
    issue_description: "Motor burned out during power surge.",
    date: "2026-05-28",
    status: "Resolved",
    warranty: "Unwarranted",
    status_history: [
      { status: "Pending", note: "Complaint registered", at: "2026-05-28T11:00:00Z" },
      { status: "In Progress", note: "Awaiting replacement parts", at: "2026-05-29T10:00:00Z" },
      { status: "Resolved", note: "Motor replaced, fan tested ok", at: "2026-05-30T16:45:00Z" }
    ],
    photos: [],
    created_at: "2026-05-28T11:00:00Z",
    updated_at: "2026-05-30T16:45:00Z"
  }
];

const getMockComplaints = () => {
  const data = localStorage.getItem("mock_complaints");
  if (!data) {
    localStorage.setItem("mock_complaints", JSON.stringify(MOCK_COMPLAINTS_SEED));
    return MOCK_COMPLAINTS_SEED;
  }
  return JSON.parse(data);
};

const setMockComplaints = (list) => {
  localStorage.setItem("mock_complaints", JSON.stringify(list));
};

const getMockCustomers = () => {
  const data = localStorage.getItem("mock_customers");
  if (!data) {
    const list = getMockComplaints().map(c => ({
      phone: c.phone,
      name: c.name,
      address: c.address,
      village: c.village,
      city: c.city,
      district: c.district,
      state: c.state,
      pincode: c.pincode,
      created_at: c.created_at,
      updated_at: c.updated_at
    }));
    localStorage.setItem("mock_customers", JSON.stringify(list));
    return list;
  }
  return JSON.parse(data);
};

const setMockCustomers = (list) => {
  localStorage.setItem("mock_customers", JSON.stringify(list));
};

// ----------------------------------------------------
// ⚡ Custom Axios Adapter for Sandbox Mode Interception
// ----------------------------------------------------
const demoAdapter = (config) => {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(config.url, window.location.origin);
      let path = urlObj.pathname;
      if (path.startsWith("/api")) {
        path = path.substring(4);
      }
      const method = config.method.toUpperCase();
      const params = Object.fromEntries(urlObj.searchParams);
      const body = config.data ? JSON.parse(config.data) : null;

      let responseData = null;
      let status = 200;

      if (path === "/auth/login" && method === "POST") {
        if (body.password === "Admin@123") {
          responseData = {
            access_token: "mock-jwt-token-12345",
            token_type: "bearer",
            email: body.email
          };
          localStorage.setItem("sw_token", "mock-jwt-token-12345");
          localStorage.setItem("sw_email", body.email);
        } else {
          status = 401;
          responseData = { detail: "Invalid email or password" };
        }
      } else if (path === "/auth/me" && method === "GET") {
        responseData = { email: localStorage.getItem("sw_email") || "admin@company.com" };
      } else if (path === "/complaints" && method === "GET") {
        let list = getMockComplaints();
        const q = params.q ? params.q.toLowerCase() : "";
        const statusFilter = params.status_filter;

        if (statusFilter) {
          list = list.filter(c => c.status === statusFilter);
        }
        if (q) {
          list = list.filter(c => 
            c.complaint_id.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.phone.toLowerCase().includes(q) ||
            c.product_serial.toLowerCase().includes(q) ||
            (c.issue_description && c.issue_description.toLowerCase().includes(q))
          );
        }
        responseData = list;
      } else if (path === "/complaints" && method === "POST") {
        const list = getMockComplaints();
        const cid = (620260000 + list.length + 1).toString();
        const now = new Date().toISOString();
        const newComplaint = {
          id: Math.random().toString(36).substring(7),
          complaint_id: cid,
          name: body.name.trim(),
          address: body.address.trim(),
          phone: body.phone.trim(),
          village: body.village || "",
          city: body.city || "",
          district: body.district || "",
          state: body.state || "",
          pincode: body.pincode || "",
          invoice_number: body.invoice_number || "",
          product_details: body.product_details || "",
          product_serial: body.product_serial.trim(),
          issue_description: body.issue_description.trim(),
          date: body.date || new Date().toISOString().slice(0, 10),
          status: "Pending",
          warranty: body.warranty || "Warranted",
          status_history: [{ status: "Pending", note: "Complaint registered", at: now }],
          photos: [],
          created_at: now,
          updated_at: now
        };
        list.unshift(newComplaint);
        setMockComplaints(list);

        // Upsert customer
        const customers = getMockCustomers();
        const cIdx = customers.findIndex(c => c.phone === newComplaint.phone);
        const customerData = {
          phone: newComplaint.phone,
          name: newComplaint.name,
          address: newComplaint.address,
          village: newComplaint.village,
          city: newComplaint.city,
          district: newComplaint.district,
          state: newComplaint.state,
          pincode: newComplaint.pincode,
          updated_at: now,
          created_at: now
        };
        if (cIdx >= 0) {
          customerData.created_at = customers[cIdx].created_at;
          customers[cIdx] = customerData;
        } else {
          customers.unshift(customerData);
        }
        setMockCustomers(customers);

        responseData = newComplaint;
      } else if (path.startsWith("/complaints/") && path.endsWith("/status") && method === "PATCH") {
        const cid = path.split("/")[2];
        const list = getMockComplaints();
        const idx = list.findIndex(c => c.complaint_id === cid);
        if (idx >= 0) {
          const now = new Date().toISOString();
          list[idx].status = body.status;
          list[idx].status_history.push({
            status: body.status,
            note: body.note || "",
            at: now
          });
          list[idx].updated_at = now;
          setMockComplaints(list);
          responseData = list[idx];
        } else {
          status = 404;
          responseData = { detail: "Complaint not found" };
        }
      } else if (path.startsWith("/complaints/") && path.endsWith("/warranty") && method === "PATCH") {
        const cid = path.split("/")[2];
        const list = getMockComplaints();
        const idx = list.findIndex(c => c.complaint_id === cid);
        if (idx >= 0) {
          const now = new Date().toISOString();
          list[idx].warranty = body.warranty;
          list[idx].updated_at = now;
          setMockComplaints(list);
          responseData = list[idx];
        } else {
          status = 404;
          responseData = { detail: "Complaint not found" };
        }
      } else if (path.startsWith("/complaints/") && method === "GET") {
        const cid = path.split("/")[2];
        const list = getMockComplaints();
        const comp = list.find(c => c.complaint_id === cid);
        if (comp) {
          responseData = comp;
        } else {
          status = 404;
          responseData = { detail: "Complaint not found" };
        }
      } else if (path.startsWith("/track/") && method === "GET") {
        const cid = path.split("/")[2];
        const list = getMockComplaints();
        const comp = list.find(c => c.complaint_id === cid);
        if (comp) {
          const phone = comp.phone || "";
          const phone_masked = phone.length > 5 ? phone.slice(0, 3) + "XXXXX" + phone.slice(-2) : "XXXXX";
          responseData = {
            ...comp,
            phone_masked,
            brand: "sabewell"
          };
        } else {
          status = 404;
          responseData = { detail: "Complaint not found" };
        }
      } else if (path.startsWith("/complaints/") && method === "DELETE") {
        const cid = path.split("/")[2];
        let list = getMockComplaints();
        const comp = list.find(c => c.complaint_id === cid);
        if (comp) {
          list = list.filter(c => c.complaint_id !== cid);
          setMockComplaints(list);
          
          const remaining = list.filter(c => c.phone === comp.phone).length;
          if (remaining === 0) {
            const customers = getMockCustomers().filter(c => c.phone !== comp.phone);
            setMockCustomers(customers);
          }
          responseData = { ok: true };
        } else {
          status = 404;
          responseData = { detail: "Complaint not found" };
        }
      } else if (path === "/customers" && method === "GET") {
        responseData = getMockCustomers();
      } else if (path.startsWith("/customers/by-phone/") && method === "GET") {
        const phone = decodeURIComponent(path.split("/")[3]);
        const customers = getMockCustomers();
        const cust = customers.find(c => c.phone === phone);
        if (cust) {
          responseData = { found: true, customer: cust };
        } else {
          responseData = { found: false };
        }
      } else if (path.startsWith("/complaints/") && path.endsWith("/photos") && method === "POST") {
        const cid = path.split("/")[2];
        const list = getMockComplaints();
        const idx = list.findIndex(c => c.complaint_id === cid);
        if (idx >= 0) {
          const photoId = Math.random().toString(36).substring(7);
          const newPhoto = {
            id: photoId,
            url: "https://images.unsplash.com/photo-1574689100828-6619e98096ae?w=300"
          };
          list[idx].photos = list[idx].photos || [];
          list[idx].photos.push(newPhoto);
          setMockComplaints(list);
          responseData = list[idx];
        } else {
          status = 404;
          responseData = { detail: "Complaint not found" };
        }
      } else if (path.startsWith("/complaints/") && path.includes("/photos/") && method === "DELETE") {
        const parts = path.split("/");
        const cid = parts[2];
        const photoId = parts[4];
        const list = getMockComplaints();
        const idx = list.findIndex(c => c.complaint_id === cid);
        if (idx >= 0) {
          list[idx].photos = (list[idx].photos || []).filter(p => p.id !== photoId);
          setMockComplaints(list);
          responseData = { ok: true };
        } else {
          status = 404;
          responseData = { detail: "Complaint not found" };
        }
      } else {
        status = 404;
        responseData = { detail: "Not found" };
      }

      const response = {
        data: responseData,
        status: status,
        statusText: status === 200 ? "OK" : status === 201 ? "Created" : status === 401 ? "Unauthorized" : "Not Found",
        headers: { "content-type": "application/json" },
        config: config
      };

      if (status >= 200 && status < 300) {
        resolve(response);
      } else {
        const error = new Error("Request failed with status code " + status);
        error.response = response;
        reject(error);
      }
    } catch (err) {
      reject(err);
    }
  });
};

// Create Axios Instance
const api = axios.create({ baseURL: API });

// Intercept Request to inject Token or use Sandbox Adapter
api.interceptors.request.use((config) => {
  const isDemo = typeof window !== "undefined" && localStorage.getItem("demo_mode") === "true";
  if (isDemo) {
    config.adapter = demoAdapter;
  } else {
    const token = localStorage.getItem("sw_token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== "undefined") {
      const path = window.location.pathname;
      if (!path.startsWith("/login") && !path.startsWith("/track") && path !== "/") {
        localStorage.removeItem("sw_token");
        localStorage.removeItem("sw_email");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
