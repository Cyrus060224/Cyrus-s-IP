---
title: "AuditCore 智能代码与安全审计引擎"
description: "基于多 Agent 协同的代码安全分析与自动化审计引擎，深度检测系统漏洞、依赖隐患与架构异味。"
category: "ai"
status: "active"
tags: ["AI Agent", "安全审计", "Python", "静态分析", "LLM"]
featured: true
github: "https://github.com/Cyrus060224"
pubDate: 2026-09-18
---

## 项目背景

在现代软件工程中，随着代码库规模的膨胀与第三方依赖的激增，传统的静态代码分析工具（SAST）往往面临两大痛点：**误报率极高**，且**无法理解业务上下文之间的深层逻辑漏洞**。

**AuditCore** 旨在探索将大语言模型（LLM）的多 Agent 辩论机制引入代码安全审查全流程。

---

## 核心特性

- **多 Agent 交叉校验**：采用审查者（Auditor）与红队验证者（Verifier）双模型对抗架构，大幅压低虚假误报；
- **深层上下文流追踪**：不仅分析单一函数的 AST 语法树，更能跨文件追踪未经验证的用户输入流向；
- **可解释性修复建议**：直接针对检测出的 CWE 漏洞输出修复前后的对比 Diff 与测试用例。
