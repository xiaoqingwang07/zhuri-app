// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // Reanimated 官方写法就是在 effect 中对 sharedValue.value 赋值，该规则误报
      "react-hooks/immutability": "off",
      // AI 返回的 JSON 结构不定，解析层允许 any
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
