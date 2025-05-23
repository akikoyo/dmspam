let showLogs = false;
let enableSpamDM = false;
let enableLeaveGroup = false;
let stopFlag = false;

document.getElementById('stopBtn').addEventListener("click", () => {
  stopFlag = true;
  log("🛑 スパムが停止されました");
  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = false;
  submitBtn.textContent = '実行';
});

document.getElementById('image').addEventListener('change', (e) => {
  const fileName = e.target.files[0]?.name || "未選択";
  document.getElementById("fileName").textContent = fileName;
});

document.getElementById("showLogsCheckbox").addEventListener("change", (e) => {
  showLogs = e.target.checked;
});

document.getElementById("spamDmCheckbox").addEventListener("change", (e) => {
  enableSpamDM = e.target.checked;
});

document.getElementById("leaveDMCheckbox").addEventListener("change", (e) => {
  enableLeaveGroup = e.target.checked;
});

document.getElementById('form').addEventListener("submit", async (event) => {
  event.preventDefault();
  stopFlag = false;

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.classList.add("loading");
  submitBtn.textContent = "実行中...";

  const token = document.getElementById('token').value;
  const imageFile = document.getElementById("image").files[0];
  const userIdInput = document.getElementById("userIds").value.trim();
  const userIds = userIdInput ? userIdInput.split(/[\s,]+/).filter(Boolean) : null;

  let base64Image = null;
  if (imageFile) base64Image = await toBase64(imageFile);

  const isValid = await isTokenValid(token);
  if (!isValid) {
    submitBtn.disabled = false;
    submitBtn.classList.remove("loading");
    submitBtn.textContent = 'Failed';
    setTimeout(() => { submitBtn.textContent = '実行'; }, 2000);
    return;
  }

  try {
    log("🚀 実行開始...");
    await Promise.all([
      createGroupDM(token, messageContent, base64Image, userIds),
      enableSpamDM ? spamDirectMessages(token, messageContent, userIds) : null
    ].filter(Boolean));
  } catch (error) {
    log("❌ エラー: " + error.message);
  }

  submitBtn.disabled = false;
  submitBtn.classList.remove('loading');
  submitBtn.textContent = "✅ 終了";
  setTimeout(() => { submitBtn.textContent = '実行'; }, 2000);
});

const messageContent = `discord.gg/aabot\nhttps://i.imgur.com/NbBGFcf.mp4\n-# [a](https://media.discordapp.net/attachments/1370678371809230921/1375407173894537259/aidyad.png)`;

function log(message) {
  const logElement = document.getElementById("log");
  logElement.textContent += "\n" + new Date().toLocaleTimeString() + " - " + message;
  logElement.scrollTop = logElement.scrollHeight;
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function isTokenValid(token) {
  const res = await fetch("https://discord.com/api/v9/users/@me", {
    headers: { Authorization: token }
  });
  if (res.status < 300) {
    const user = await res.json();
    log("✅ トークン有効：" + user.username);
    return true;
  } else {
    log("❌ トークン無効:（status " + res.status + '）');
    return false;
  }
}

async function sendMessage(token, content, channelId) {
  const res = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content, tts: false })
  });

  if (showLogs) {
    const json = await res.json();
    log(JSON.stringify(json));
  }

  if (res.status < 300) {
    log("✅ メッセージ送信成功");
  } else if (res.status === 429) {
    const data = await res.json();
    log(`⏳ レート制限: ${data.retry_after}s`);
    await new Promise(r => setTimeout(r, data.retry_after * 1000));
    return sendMessage(token, content, channelId);
  }
}

async function createGroupDM(token, message, image = null, targetUserIds = null) {
  const friendsRes = await fetch("https://discord.com/api/v9/users/@me/relationships", {
    headers: { Authorization: token }
  });
  const friends = await friendsRes.json();

  let recipients = targetUserIds
    ? friends.filter(f => f.type === 1 && targetUserIds.includes(f.id)).map(f => f.id)
    : friends.filter(f => f.type === 1).map(f => f.id);

  recipients = recipients.slice(0, 9);
  if (!recipients.length) {
    log("❌ 対象ユーザーがいません");
    return;
  }

  let count = 0;
  while (!stopFlag) {
    const groupName = 'spam-by-ozeu-' + getRandomEmojis(10);
    try {
      const createRes = await fetch("https://discord.com/api/v9/users/@me/channels", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ recipients })
      });

      const group = await createRes.json();
      const groupId = group.id;

      const updateBody = { name: groupName };
      if (image) updateBody.icon = image;

      await fetch(`https://discord.com/api/v9/channels/${groupId}`, {
        method: "PATCH",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify(updateBody)
      });

      await sendMessage(token, message, groupId);
      if (enableLeaveGroup) await leaveGroupDM(token, groupId);
      log(`✅ グループ作成成功 (${++count})`);

    } catch (err) {
      log("❌ エラー: " + err.message);
    }
  }
}

async function spamDirectMessages(token, message, targetUserIds = null) {
  const res = await fetch("https://discord.com/api/v10/users/@me/channels", {
    headers: { Authorization: token }
  });
  const dmChannels = await res.json();

  const targets = dmChannels.filter(c => {
    const recipient = c.recipients?.[0];
    return recipient && (!targetUserIds || targetUserIds.includes(recipient.id));
  });

  while (!stopFlag) {
    for (const channel of targets) {
      if (stopFlag) return;
      try {
        await sendMessage(token, message, channel.id);
      } catch (err) {
        log("❌ DM送信エラー: " + err.message);
      }
    }
  }
}

async function leaveGroupDM(token, groupId) {
  try {
    const res = await fetch(`https://discord.com/api/v9/channels/${groupId}?silent=false`, {
      method: "DELETE",
      headers: { Authorization: token }
    });

    if (res.status < 300) {
      log(`✅ グループ ${groupId} を退出しました。`);
    } else if (res.status === 429) {
      const data = await res.json();
      log(`⏳ レート制限: ${data.retry_after}s`);
      await new Promise(r => setTimeout(r, data.retry_after * 1000));
      return leaveGroupDM(token, groupId);
    } else {
      log(`❌ 退出失敗: ${res.status}`);
    }
  } catch (err) {
    log("❌ エラー: " + err.message);
  }
}

function getRandomEmojis(count) {
  const emojis = Array.from("😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪🤨🧐🤓😎🥸🤠🤡🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑🫡🫢🫣🤤😪😴😵😵‍💫😲😯😬🙄😮‍💨😷🤒🤕🤢🤮🤧😇🥹🤑🤠😈👿👹👺💀☠️👻👽🤖🎃😺😸😹😻😼😽🙀😿😾");
  let result = '';
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * emojis.length);
    result += emojis[randomIndex];
  }
  return result;
}
