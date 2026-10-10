import { defineConfig } from 'vitepress'

const base = '/TencentDB-Agent-Memory/'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: 'TencentDB Agent Memory 深度指南',
  titleTemplate: '从介绍、全景、入门到进阶',
  description:
    '从介绍、全景、入门到进阶：理解、部署与深挖 TencentDB Agent Memory——架构与数据流、快速上手、源码内幕与生产实践。',

  base,
  lastUpdated: true,
  cleanUrls: true,
  srcExclude: ['README.md'],

  markdown: {
    // shiki 3.x 不再内置 cuda 语法, 用 cpp 高亮兜底
    languageAlias: { cuda: 'cpp' },
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['meta', { name: 'theme-color', content: '#2e7d5b', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#18191c', media: '(prefers-color-scheme: dark)' }],
    ['meta', { property: 'og:title', content: 'TencentDB Agent Memory 深度指南' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          '从介绍、全景、入门到进阶：理解、部署与深挖 TencentDB Agent Memory——架构与数据流、快速上手、源码内幕与生产实践。',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    // 学习笔记悬浮组件（localStorage），VitePress SPA 路由切换由 theme/index.ts 通知其重挂载
    ['script', { src: `${base}notes.js` }],
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/favicon.svg',

    nav: [
      { text: '首页', link: '/' },
      { text: '介绍', link: '/intro/' },
      { text: '快速开始', link: '/getting-started/quickstart' },
      { text: '进阶', link: '/advanced/' },
    ],

    sidebar: [
      {
        text: 'Part I — 介绍：为什么与是什么',
        collapsed: false,
        items: [
          { text: 'Agent 记忆的问题意识', link: '/intro/' },
          { text: 'TencentDB Agent Memory 是什么', link: '/intro/what-is-this' },
          { text: '核心概念：资产、Team 与 Loadout', link: '/intro/core-concepts' },
          { text: '它不是聊天记录仓库，也不是普通 RAG', link: '/intro/comparison' },
        ],
      },
      {
        text: 'Part II — 全景：架构与数据流',
        collapsed: false,
        items: [
          { text: '总体架构：四个服务 + 一组 SDK', link: '/panorama/' },
          { text: '组件巡礼：Core、Knowledge、Panel、Proxy', link: '/panorama/components' },
          { text: '记忆模型：L0 → L3 的分层生长', link: '/panorama/memory-model' },
          { text: '资产体系与权限模型', link: '/panorama/asset-system' },
          { text: '一次请求的完整旅程', link: '/panorama/dataflow' },
        ],
      },
      {
        text: 'Part III — 入门：从零跑起来',
        collapsed: false,
        items: [
          { text: '快速开始总览', link: '/getting-started/' },
          { text: '一键部署三件套', link: '/getting-started/quickstart' },
          { text: '建立组织结构并接入 Claude Code', link: '/getting-started/first-memory' },
          { text: '更多客户端接入', link: '/getting-started/clients' },
          { text: '冷启动：先读档，再开工', link: '/getting-started/cold-start' },
          { text: '常见问题排查', link: '/getting-started/troubleshooting' },
        ],
      },
      {
        text: 'Part IV — 进阶：源码内幕与生产实践',
        collapsed: false,
        items: [
          { text: '进阶导览', link: '/advanced/' },
          { text: 'MemoryCore 内幕：存储与网关', link: '/advanced/memorycore-internals' },
          { text: '生成管线与召回机制', link: '/advanced/pipeline-recall' },
          { text: '自定义 Prompt 与生成溯源', link: '/advanced/custom-prompt-lineage' },
          { text: 'MemoryProxy 内幕：注入管线与会话初始化', link: '/advanced/proxy-internals' },
          { text: '`mem:` 会话指令', link: '/advanced/mem-commands' },
          { text: 'MemoryKnowledge 内幕：Wiki 引擎与 CodeGraph', link: '/advanced/knowledge-internals' },
          { text: 'MemoryPanel 内幕：管控面架构', link: '/advanced/panel-internals' },
          { text: 'SDK 深度使用', link: '/advanced/sdk-guide' },
          { text: '编写自定义 Adapter', link: '/advanced/custom-adapter' },
          { text: '部署形态进阶：单机到多节点', link: '/advanced/deployment-topologies' },
          { text: '可观测性体系', link: '/advanced/observability' },
          { text: '升级与数据迁移', link: '/advanced/upgrade-migration' },
        ],
      },
      {
        text: '附录',
        collapsed: false,
        items: [
          { text: '环境变量速查', link: '/appendix/env-vars' },
          { text: '术语表', link: '/appendix/glossary' },
          { text: 'FAQ 汇编', link: '/appendix/faq' },
        ],
      },
    ],

    outline: {
      level: [2, 3],
      label: '本页大纲',
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    editLink: {
      pattern: 'https://github.com/Atituiset/TencentDB-Agent-Memory/edit/feat/server_team/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/Atituiset/TencentDB-Agent-Memory' }],

    docFooter: { prev: '上一页', next: '下一页' },

    lastUpdated: {
      text: '最后更新于',
      formatOptions: { dateStyle: 'short', timeStyle: 'short' },
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    skipToContentLabel: '跳转到内容',

    footer: {
      message: 'TencentDB Agent Memory 深度指南',
      copyright: 'Copyright © 2026 TencentDB Agent Memory',
    },
  },
})
