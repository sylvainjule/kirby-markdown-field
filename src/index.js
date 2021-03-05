/* Register icons
-------------------------*/

import "./assets/icons/icons.js";

/* Register components
-------------------------*/

import MarkdownField from "./components/MarkdownField.vue";
import MarkdownInput from "./components/MarkdownInput.vue";
// import MarkdownToolbar from "./components/MarkdownToolbar.vue";

panel.plugin("community/markdown-field", {
  components: {
    "k-markdown-input": MarkdownInput,
    // "k-markdown-toolbar": MarkdownToolbar,
  },
  fields: {
    markdown: MarkdownField,
  },
});
