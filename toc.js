// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded affix "><li class="spacer"></li><li class="chapter-item expanded affix "><li class="part-title">Part I — 介绍：为什么与是什么</li><li class="chapter-item expanded "><a href="intro/index.html"><strong aria-hidden="true">1.</strong> Agent 记忆的问题意识</a></li><li class="chapter-item expanded "><a href="intro/what-is-this.html"><strong aria-hidden="true">2.</strong> TencentDB Agent Memory 是什么</a></li><li class="chapter-item expanded "><a href="intro/core-concepts.html"><strong aria-hidden="true">3.</strong> 核心概念：资产、Team 与 Loadout</a></li><li class="chapter-item expanded "><a href="intro/comparison.html"><strong aria-hidden="true">4.</strong> 它不是聊天记录仓库，也不是普通 RAG</a></li><li class="chapter-item expanded affix "><li class="part-title">Part II — 全景：架构与数据流</li><li class="chapter-item expanded "><a href="panorama/index.html"><strong aria-hidden="true">5.</strong> 总体架构：四个服务 + 一组 SDK</a></li><li class="chapter-item expanded "><a href="panorama/components.html"><strong aria-hidden="true">6.</strong> 组件巡礼：Core、Knowledge、Panel、Proxy</a></li><li class="chapter-item expanded "><a href="panorama/memory-model.html"><strong aria-hidden="true">7.</strong> 记忆模型：L0 → L3 的分层生长</a></li><li class="chapter-item expanded "><a href="panorama/asset-system.html"><strong aria-hidden="true">8.</strong> 资产体系与权限模型</a></li><li class="chapter-item expanded "><a href="panorama/dataflow.html"><strong aria-hidden="true">9.</strong> 一次请求的完整旅程</a></li><li class="chapter-item expanded affix "><li class="part-title">Part III — 入门：从零跑起来</li><li class="chapter-item expanded "><a href="getting-started/index.html"><strong aria-hidden="true">10.</strong> 快速开始总览</a></li><li class="chapter-item expanded "><a href="getting-started/quickstart.html"><strong aria-hidden="true">11.</strong> 一键部署三件套</a></li><li class="chapter-item expanded "><a href="getting-started/first-memory.html"><strong aria-hidden="true">12.</strong> 建立组织结构并接入 Claude Code</a></li><li class="chapter-item expanded "><a href="getting-started/clients.html"><strong aria-hidden="true">13.</strong> 更多客户端接入</a></li><li class="chapter-item expanded "><a href="getting-started/cold-start.html"><strong aria-hidden="true">14.</strong> 冷启动：先读档，再开工</a></li><li class="chapter-item expanded "><a href="getting-started/troubleshooting.html"><strong aria-hidden="true">15.</strong> 常见问题排查</a></li><li class="chapter-item expanded affix "><li class="part-title">Part IV — 进阶：源码内幕与生产实践</li><li class="chapter-item expanded "><a href="advanced/index.html"><strong aria-hidden="true">16.</strong> 进阶导览</a></li><li class="chapter-item expanded "><a href="advanced/memorycore-internals.html"><strong aria-hidden="true">17.</strong> MemoryCore 内幕：存储与网关</a></li><li class="chapter-item expanded "><a href="advanced/pipeline-recall.html"><strong aria-hidden="true">18.</strong> 生成管线与召回机制</a></li><li class="chapter-item expanded "><a href="advanced/custom-prompt-lineage.html"><strong aria-hidden="true">19.</strong> 自定义 Prompt 与生成溯源</a></li><li class="chapter-item expanded "><a href="advanced/proxy-internals.html"><strong aria-hidden="true">20.</strong> MemoryProxy 内幕：注入管线与会话初始化</a></li><li class="chapter-item expanded "><a href="advanced/mem-commands.html"><strong aria-hidden="true">21.</strong> mem: 会话指令</a></li><li class="chapter-item expanded "><a href="advanced/knowledge-internals.html"><strong aria-hidden="true">22.</strong> MemoryKnowledge 内幕：Wiki 引擎与 CodeGraph</a></li><li class="chapter-item expanded "><a href="advanced/panel-internals.html"><strong aria-hidden="true">23.</strong> MemoryPanel 内幕：管控面架构</a></li><li class="chapter-item expanded "><a href="advanced/sdk-guide.html"><strong aria-hidden="true">24.</strong> SDK 深度使用</a></li><li class="chapter-item expanded "><a href="advanced/custom-adapter.html"><strong aria-hidden="true">25.</strong> 编写自定义 Adapter</a></li><li class="chapter-item expanded "><a href="advanced/deployment-topologies.html"><strong aria-hidden="true">26.</strong> 部署形态进阶：单机到多节点</a></li><li class="chapter-item expanded "><a href="advanced/observability.html"><strong aria-hidden="true">27.</strong> 可观测性体系</a></li><li class="chapter-item expanded "><a href="advanced/upgrade-migration.html"><strong aria-hidden="true">28.</strong> 升级与数据迁移</a></li><li class="chapter-item expanded affix "><li class="spacer"></li><li class="chapter-item expanded affix "><li class="part-title">附录</li><li class="chapter-item expanded "><a href="appendix/env-vars.html"><strong aria-hidden="true">29.</strong> 环境变量速查</a></li><li class="chapter-item expanded "><a href="appendix/glossary.html"><strong aria-hidden="true">30.</strong> 术语表</a></li><li class="chapter-item expanded "><a href="appendix/faq.html"><strong aria-hidden="true">31.</strong> FAQ 汇编</a></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString().split("#")[0].split("?")[0];
        if (current_page.endsWith("/")) {
            current_page += "index.html";
        }
        var links = Array.prototype.slice.call(this.querySelectorAll("a"));
        var l = links.length;
        for (var i = 0; i < l; ++i) {
            var link = links[i];
            var href = link.getAttribute("href");
            if (href && !href.startsWith("#") && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The "index" page is supposed to alias the first chapter in the book.
            if (link.href === current_page || (i === 0 && path_to_root === "" && current_page.endsWith("/index.html"))) {
                link.classList.add("active");
                var parent = link.parentElement;
                if (parent && parent.classList.contains("chapter-item")) {
                    parent.classList.add("expanded");
                }
                while (parent) {
                    if (parent.tagName === "LI" && parent.previousElementSibling) {
                        if (parent.previousElementSibling.classList.contains("chapter-item")) {
                            parent.previousElementSibling.classList.add("expanded");
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                sessionStorage.setItem('sidebar-scroll', this.scrollTop);
            }
        }, { passive: true });
        var sidebarScrollTop = sessionStorage.getItem('sidebar-scroll');
        sessionStorage.removeItem('sidebar-scroll');
        if (sidebarScrollTop) {
            // preserve sidebar scroll position when navigating via links within sidebar
            this.scrollTop = sidebarScrollTop;
        } else {
            // scroll sidebar to current active section when navigating via "next/previous chapter" buttons
            var activeSection = document.querySelector('#sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        var sidebarAnchorToggles = document.querySelectorAll('#sidebar a.toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(function (el) {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define("mdbook-sidebar-scrollbox", MDBookSidebarScrollbox);
