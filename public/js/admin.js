// ============================================
// 素材兼职平台 v2.1 - 管理后台
// ============================================

var adminToken = localStorage.getItem('adminToken') || '';
var matFilter = 'all';
var ordFilter = 'all';
var allAdminOrders = [];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Login ---
async function login() {
  var password = document.getElementById('loginPassword').value;
  var errorEl = document.getElementById('loginError');
  if (!password) { errorEl.textContent = '请输入密码'; errorEl.style.display = 'block'; return; }

  try {
    var res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    });
    var data = await res.json();
    if (data.success) {
      adminToken = data.token;
      localStorage.setItem('adminToken', adminToken);
      showPanel();
    } else {
      errorEl.textContent = data.message || '登录失败';
      errorEl.style.display = 'block';
    }
  } catch (e) {
    errorEl.textContent = '网络错误';
    errorEl.style.display = 'block';
  }
}

function logout() {
  adminToken = '';
  localStorage.removeItem('adminToken');
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('adminPanel').classList.remove('active');
}

function showPanel() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('adminPanel').classList.add('active');
  loadAll();
}

// --- Check auth ---
document.addEventListener('DOMContentLoaded', function() {
  if (adminToken) {
    fetch('/api/admin/materials', { headers: { 'x-admin-token': adminToken } })
      .then(function(r) {
        if (r.ok) showPanel();
        else { adminToken = ''; localStorage.removeItem('adminToken'); }
      })
      .catch(function() {});
  }
});

// --- API helper ---
async function adminFetch(url, options) {
  options = options || {};
  var headers = Object.assign({}, options.headers || {}, { 'x-admin-token': adminToken });
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  var res = await fetch(url, Object.assign({}, options, { headers: headers }));
  if (res.status === 401) {
    logout();
    showToast('登录过期，请重新登录');
    throw new Error('Unauthorized');
  }
  return res;
}

// --- Load All ---
function loadAll() {
  loadStats();
  loadMaterials();
  loadOrders();
  loadUsers();
  loadAnnouncements();
}

// --- Tab Switch ---
function switchTab(tab, el) {
  document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.admin-section').forEach(function(s) { s.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('section-' + tab).classList.add('active');
}

// --- Stats ---
async function loadStats() {
  try {
    var res = await fetch('/api/stats');
    var data = await res.json();
    if (data.success) {
      var s = data.data;
      document.getElementById('adminStats').innerHTML =
        statCard(s.totalMaterials, '活跃素材', '#e91e63') +
        statCard(s.totalOrders, '总接单', '#ff9800') +
        statCard(s.totalUsers, '用户数', '#9c27b0') +
        statCard(s.pendingReview, '待审核', '#f44336') +
        statCard('¥' + s.totalPaid, '已打款', '#4caf50');
    }
  } catch (e) {}
}

function statCard(num, label, color) {
  return '<div class="stat-card" style="border-top:3px solid ' + color + ';">' +
    '<div class="stat-card-num" style="color:' + color + ';">' + num + '</div>' +
    '<div class="stat-card-label">' + label + '</div></div>';
}

// --- Publish ---
async function publishMaterial(e) {
  e.preventDefault();
  var platform = document.getElementById('formPlatform').value;
  var type = document.getElementById('formType').value;
  var title = document.getElementById('formTitle').value;
  var copyText = document.getElementById('formCopyText').value;
  var reward = document.getElementById('formReward').value;
  var maxOrders = document.getElementById('formMaxOrders').value;
  var tags = document.getElementById('formTags').value;
  var expireDays = document.getElementById('formExpireDays').value;
  var imagesInput = document.getElementById('formImages');

  if (!platform || !type || !title || !reward) { showToast('请填写所有必填项~'); return; }

  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '上传图片中...';

  try {
    // Step 1: Upload images to Supabase Storage
    var imageUrls = [];
    if (imagesInput.files) {
      for (var i = 0; i < imagesInput.files.length && i < 9; i++) {
        var fd = new FormData();
        fd.append('file', imagesInput.files[i]);
        var upRes = await fetch('/api/upload', { method: 'POST', body: fd });
        var upData = await upRes.json();
        if (upData.success) {
          imageUrls.push(upData.url);
        } else {
          showToast('图片上传失败: ' + (upData.message || '未知错误'));
          btn.disabled = false;
          btn.textContent = '🚀 发布素材';
          return;
        }
      }
    }

    btn.textContent = '发布中...';

    // Step 2: Create material with image URLs
    var res = await adminFetch('/api/admin/materials', {
      method: 'POST',
      body: JSON.stringify({
        platform: platform, type: type, title: title, copyText: copyText,
        reward: reward, maxOrders: maxOrders, tags: tags, expireDays: expireDays,
        images: imageUrls
      })
    });
    var data = await res.json();
    if (data.success) {
      showToast('🎉 发布成功~');
      document.getElementById('publishForm').reset();
      document.getElementById('imagePreview').innerHTML = '';
      loadStats();
    } else {
      showToast(data.message || '发布失败~');
    }
  } catch (e) { showToast('发布失败~'); }
  btn.disabled = false;
  btn.textContent = '🚀 发布素材';
}

function previewImages(input) {
  var preview = document.getElementById('imagePreview');
  preview.innerHTML = '';
  if (input.files) {
    Array.from(input.files).slice(0, 9).forEach(function(file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var div = document.createElement('div');
        div.className = 'preview-thumb';
        div.innerHTML = '<img src="' + e.target.result + '" alt="">';
        preview.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }
}

// --- Materials ---
async function loadMaterials() {
  try {
    var res = await adminFetch('/api/admin/materials');
    var data = await res.json();
    if (data.success) renderMaterials(data.data);
  } catch (e) {}
}

function renderMaterials(materials) {
  var list = document.getElementById('adminMaterialList');
  var filtered = materials;
  if (matFilter !== 'all') filtered = materials.filter(function(m) { return m.status === matFilter; });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-emoji">📭</div><p>暂无素材</p></div>';
    return;
  }

  list.innerHTML = filtered.map(function(m) {
    var platformLabel = m.platform === 'xiaohongshu' ? '📕 小红书' : '🎵 抖音';
    var typeLabel = { image: '图文', video: '视频', comment: '评论' }[m.type];
    var statusClass = 'status-' + m.status;
    var statusLabel = { active: '进行中', archived: '已归档' }[m.status] || m.status;
    var date = new Date(m.createdAt).toLocaleDateString('zh-CN');
    return '<div class="admin-item">' +
      '<div class="admin-item-header">' +
        '<span class="admin-item-title">' + escapeHtml(m.title) + '</span>' +
        '<span class="badge ' + statusClass + '">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="admin-item-meta">' +
        '<span>' + platformLabel + '</span><span>' + typeLabel + '</span>' +
        '<span>💰¥' + m.reward + '</span><span>👥' + m.currentOrders + '/' + m.maxOrders + '</span>' +
        '<span>' + date + '</span>' +
      '</div>' +
      '<div class="admin-item-actions">' +
        '<button class="btn-sm btn-edit" onclick="editMaterial(\'' + m.id + '\')">✏️ 编辑</button>' +
        (m.status === 'active' ? '<button class="btn-sm btn-archive" onclick="archiveMaterial(\'' + m.id + '\')">📦 归档</button>' : '') +
        '<button class="btn-sm btn-delete" onclick="deleteMaterial(\'' + m.id + '\')">🗑️ 删除</button>' +
      '</div></div>';
  }).join('');
}

function filterMats(filter, el) {
  matFilter = filter;
  el.parentElement.querySelectorAll('.filter-pill').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  loadMaterials();
}

async function archiveMaterial(id) {
  if (!confirm('确定归档吗？')) return;
  try {
    var res = await adminFetch('/api/admin/materials/' + id + '/archive', { method: 'POST' });
    var data = await res.json();
    if (data.success) { showToast('✅ 已归档'); loadMaterials(); loadStats(); }
  } catch (e) { showToast('操作失败~'); }
}

async function deleteMaterial(id) {
  if (!confirm('确定删除？不可恢复哦！')) return;
  try {
    var res = await adminFetch('/api/admin/materials/' + id, { method: 'DELETE' });
    var data = await res.json();
    if (data.success) { showToast('✅ 已删除'); loadMaterials(); loadStats(); }
  } catch (e) { showToast('删除失败~'); }
}

function editMaterial(id) {
  fetch('/api/materials/' + id)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        var m = data.data;
        document.getElementById('editId').value = m.id;
        document.getElementById('editTitle').value = m.title;
        document.getElementById('editCopyText').value = m.copyText || '';
        document.getElementById('editReward').value = m.reward;
        document.getElementById('editMaxOrders').value = m.maxOrders;
        document.getElementById('editModal').classList.add('active');
      }
    });
}

function closeEdit() { document.getElementById('editModal').classList.remove('active'); }

async function saveEdit() {
  var id = document.getElementById('editId').value;
  var updates = {
    title: document.getElementById('editTitle').value,
    copyText: document.getElementById('editCopyText').value,
    reward: parseFloat(document.getElementById('editReward').value),
    maxOrders: parseInt(document.getElementById('editMaxOrders').value)
  };
  try {
    var res = await adminFetch('/api/admin/materials/' + id, { method: 'PUT', body: JSON.stringify(updates) });
    var data = await res.json();
    if (data.success) { showToast('✅ 更新成功'); closeEdit(); loadMaterials(); }
  } catch (e) { showToast('更新失败~'); }
}

// --- Orders ---
async function loadOrders() {
  try {
    var res = await adminFetch('/api/admin/orders');
    var data = await res.json();
    if (data.success) {
      allAdminOrders = data.data;
      renderOrders();
    }
  } catch (e) {}
}

function filterOrds(filter, el) {
  ordFilter = filter;
  el.parentElement.querySelectorAll('.filter-pill').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  renderOrders();
}

function renderOrders() {
  var orders = allAdminOrders;
  if (ordFilter !== 'all') orders = orders.filter(function(o) { return o.status === ordFilter; });

  var list = document.getElementById('adminOrderList');
  if (orders.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-emoji">📭</div><p>暂无订单</p></div>';
    return;
  }

  var statusMap = {
    accepted:  { label: '进行中', cls: 'st-active' },
    submitted: { label: '待审核', cls: 'st-submitted' },
    approved:  { label: '已通过', cls: 'st-approved' },
    rejected:  { label: '已驳回', cls: 'st-rejected' },
    paid:      { label: '已打款', cls: 'st-paid' }
  };

  list.innerHTML = orders.map(function(o) {
    var st = statusMap[o.status] || { label: o.status, cls: '' };
    var date = new Date(o.acceptedAt).toLocaleDateString('zh-CN');
    var imagesHtml = '';
    if (o.postUrl) {
      imagesHtml = '<div class="note-box" style="background:#e8f5e9;"><a href="' + escapeHtml(o.postUrl) + '" target="_blank" style="color:#2e7d32;word-break:break-all;">🔗 ' + escapeHtml(o.postUrl) + '</a></div>';
    }
    var qrcodeHtml = '';
    if (o.userQrcode) {
      qrcodeHtml = '<div style="margin:8px 0;"><span style="font-size:12px;color:var(--text-sub);">💳 用户收款码：</span><br><img src="' + escapeHtml(o.userQrcode) + '" style="width:100px;height:100px;object-fit:contain;border-radius:8px;border:2px solid var(--border);margin-top:4px;cursor:pointer;" onclick="window.open(\'' + escapeHtml(o.userQrcode) + '\')" alt="收款码"></div>';
    }
    return '<div class="admin-item">' +
      '<div class="admin-item-header">' +
        '<span class="admin-item-title">' + escapeHtml(o.materialTitle) + '</span>' +
        '<span class="badge ' + st.cls + '">' + st.label + '</span>' +
      '</div>' +
      '<div class="admin-item-meta">' +
        '<span>👤 ' + escapeHtml(o.userName) + '</span>' +
        (o.userWechat ? '<span>💬 ' + escapeHtml(o.userWechat) + '</span>' : '') +
        '<span>💰¥' + o.reward + '</span>' +
        '<span>📅 ' + date + '</span>' +
      '</div>' +
      imagesHtml +
      qrcodeHtml +
      (o.submitNote ? '<div class="note-box">📝 ' + escapeHtml(o.submitNote) + '</div>' : '') +
      (o.reviewNote ? '<div class="note-box note-review">💬 ' + escapeHtml(o.reviewNote) + '</div>' : '') +
      '<div class="admin-item-actions">' +
        (o.status === 'submitted' ? '<button class="btn-sm btn-review" onclick="openReview(this)" data-order-id="' + o.id + '" data-title="' + escapeHtml(o.materialTitle) + '" data-user="' + escapeHtml(o.userName) + '" data-reward="' + o.reward + '">📋 审核</button>' : '') +
        (o.status === 'approved' ? '<button class="btn-sm btn-pay" onclick="markPaid(\'' + o.id + '\')">💰 打款</button>' : '') +
      '</div></div>';
  }).join('');
}

function openReview(btn) {
  var orderId = btn.dataset.orderId;
  var title = btn.dataset.title;
  var userName = btn.dataset.user;
  var reward = btn.dataset.reward;
  document.getElementById('reviewContent').innerHTML =
    '<div class="review-info">' +
    '<div class="review-title">' + escapeHtml(title) + '</div>' +
    '<div class="review-meta">接单人：' + escapeHtml(userName) + ' ｜ 赏金：¥' + reward + '</div>' +
    '</div>';
  document.getElementById('reviewNote').value = '';
  document.getElementById('reviewModal').classList.add('active');
  document.getElementById('reviewModal').dataset.orderId = orderId;
}

function closeReview() { document.getElementById('reviewModal').classList.remove('active'); }

async function reviewOrder(action) {
  var orderId = document.getElementById('reviewModal').dataset.orderId;
  var note = document.getElementById('reviewNote').value;
  try {
    var res = await adminFetch('/api/admin/orders/' + orderId + '/review', {
      method: 'POST', body: JSON.stringify({ action: action, note: note })
    });
    var data = await res.json();
    if (data.success) {
      showToast(action === 'approve' ? '✅ 已通过~' : '已驳回');
      closeReview();
      loadOrders();
      loadStats();
    }
  } catch (e) { showToast('操作失败~'); }
}

async function markPaid(orderId) {
  if (!confirm('确认已打款？')) return;
  try {
    var res = await adminFetch('/api/admin/orders/' + orderId + '/pay', { method: 'POST', body: '{}' });
    var data = await res.json();
    if (data.success) { showToast('💰 已标记打款~'); loadOrders(); loadStats(); }
  } catch (e) { showToast('操作失败~'); }
}

// --- Users ---
async function loadUsers() {
  try {
    var res = await adminFetch('/api/admin/users');
    var data = await res.json();
    if (data.success) renderUsers(data.data);
  } catch (e) {}
}

function renderUsers(users) {
  var list = document.getElementById('adminUserList');
  if (users.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-emoji">👥</div><p>暂无用户</p></div>';
    return;
  }
  list.innerHTML = users.map(function(u) {
    var date = new Date(u.createdAt).toLocaleDateString('zh-CN');
    return '<div class="admin-item">' +
      '<div class="admin-item-header">' +
        '<span class="admin-item-title">👤 ' + escapeHtml(u.nickname) + '</span>' +
        '<span style="font-size:12px;color:#999;">' + date + '</span>' +
      '</div>' +
      '<div class="admin-item-meta">' +
        (u.wechat ? '<span>💬 ' + escapeHtml(u.wechat) + '</span>' : '') +
        (u.qrcode ? '<span style="color:var(--success);">💳 已上传收款码</span>' : '<span style="color:var(--danger);">💳 未上传收款码</span>') +
        '<span>📋接单' + u.totalOrders + '</span>' +
        '<span>✅完成' + u.completedOrders + '</span>' +
        '<span>💰¥' + u.totalEarned + '</span>' +
      '</div>' +
      (u.qrcode ? '<div style="margin-top:8px;"><img src="' + escapeHtml(u.qrcode) + '" style="width:80px;height:80px;object-fit:contain;border-radius:8px;border:2px solid var(--border);cursor:pointer;" onclick="window.open(\'' + escapeHtml(u.qrcode) + '\')" alt="收款码"></div>' : '') +
      '</div>';
  }).join('');
}

// --- Announcements ---
async function loadAnnouncements() {
  try {
    var res = await adminFetch('/api/admin/announcements');
    var data = await res.json();
    if (data.success) renderAnnouncements(data.data);
  } catch (e) {}
}

function renderAnnouncements(anns) {
  var list = document.getElementById('announcementList');
  if (anns.length === 0) {
    list.innerHTML = '<p style="color:#999;font-size:13px;">暂无公告</p>';
    return;
  }
  list.innerHTML = anns.map(function(a) {
    var date = new Date(a.createdAt).toLocaleDateString('zh-CN');
    return '<div class="admin-item" style="padding:12px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div><div style="font-weight:600;">' + (a.pinned ? '📌 ' : '') + escapeHtml(a.title) + '</div>' +
        '<div style="font-size:12px;color:#999;">' + date + '</div></div>' +
        '<button class="btn-sm btn-delete" onclick="deleteAnn(\'' + a.id + '\')">删除</button>' +
      '</div></div>';
  }).join('');
}

async function addAnnouncement() {
  var title = document.getElementById('annTitle').value;
  var content = document.getElementById('annContent').value;
  var pinned = document.getElementById('annPinned').checked;
  if (!title) { showToast('请输入标题~'); return; }
  try {
    var res = await adminFetch('/api/admin/announcements', {
      method: 'POST', body: JSON.stringify({ title: title, content: content, pinned: pinned })
    });
    var data = await res.json();
    if (data.success) {
      showToast('✅ 发布成功~');
      document.getElementById('annTitle').value = '';
      document.getElementById('annContent').value = '';
      document.getElementById('annPinned').checked = false;
      loadAnnouncements();
    }
  } catch (e) { showToast('发布失败~'); }
}

async function deleteAnn(id) {
  if (!confirm('确定删除？')) return;
  try {
    var res = await adminFetch('/api/admin/announcements/' + id, { method: 'DELETE' });
    var data = await res.json();
    if (data.success) { showToast('✅ 已删除'); loadAnnouncements(); }
  } catch (e) { showToast('删除失败~'); }
}

// --- Toast ---
function showToast(msg) {
  var toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}
