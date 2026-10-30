# 轻记 (Qingji)

[中文](#中文) | [English](#english)

## 中文

一个用于记录日常琐事和小额收支的 Android 本地记事本。

### 使用范围与免责说明

本项目仅供日常记事和小账记录使用。**切勿保存重要账号、密码、支付信息、身份资料或其他敏感数据**，也不要将其作为密码管理工具或重要资料的唯一保存方式。

在适用法律允许的范围内，因使用本项目存储上述敏感信息而造成的泄露、损失或其他后果，由使用者自行承担，作者不承担责任。请根据自身需要评估使用风险，并妥善保管备份。

### 注意事项

- 数据保存在本机，请定期导出备份。
- 卸载应用或清除应用数据会删除本地记录。
- 请提前生成并保存备用恢复码；未设置恢复码时，忘记密码将无法解锁加密记录。
- 恢复码只显示一次，请与笔记备份分开保存。重新生成恢复码后，旧备份仍需使用导出时对应的恢复码。
- 更新应用前建议导出备份。覆盖更新需要使用同一签名的安装包。
- 提交源码或反馈问题时，请勿附带真实笔记、密码、恢复码或应用签名私钥。

### 构建说明

当前构建脚本包含本机的 Java、Android SDK 和 Node 依赖路径。换电脑编译时，需要根据实际环境调整相关配置，并保留第三方库的许可证文件。

## English

An Android notebook for everyday notes and tracking small amounts of income and expenses. Data is stored locally on your device.

### Intended Use and Disclaimer

This project is intended only for everyday notes and small personal financial records. **Do not store important account credentials, passwords, payment information, identity information, or other sensitive data.** Do not use it as a password manager or as the only place you keep important information.

To the extent permitted by applicable law, you are responsible for any disclosure, loss, or other consequences resulting from storing such sensitive information in this project, and the author assumes no liability for those consequences. Assess whether the app is suitable for your needs and keep your backups secure.

### Important Notes

- Data is stored on your device. Export backups regularly.
- Uninstalling the app or clearing its app data deletes local records.
- Generate and save a recovery code in advance. If you forget your password without having set up a recovery code, you cannot unlock encrypted records.
- The recovery code is shown only once. Keep it separately from your note backups. After generating a new recovery code, older backups still require the recovery code associated with them when they were exported.
- Export a backup before updating the app. Updating an existing installation requires an APK signed with the same signing key.
- Do not include real notes, passwords, recovery codes, or app signing private keys when committing source code or reporting issues.

### Build Notes

The current build scripts contain local paths for Java, the Android SDK, and Node dependencies. When building on another computer, adjust the configuration for your environment and retain the license files for third-party libraries.
