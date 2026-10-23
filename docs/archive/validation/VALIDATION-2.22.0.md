# 2.22.0 validation

- Email registration/login policy, legacy account/verified-email compatibility, captcha and mail throttles: focused server/client checks passed. Existing UUID-based storage is unchanged; no database migration or automatic email binding.
- Admin permissions retain the existing allowlist and support optional existing account UUIDs. Protected admin views display verified email; public responses do not expose password/session secrets.
- Guest demonstration, unread persistence and recycle-bin checks: 23 focused tests passed. Compact card time formatting: one focused regression passed. TypeScript, privacy gate (24 catalog examples) and production web build passed.
- Built UI checked at 390px and 320px: one arrow toggle, no duplicate bottom collapse, top-bar Android download, simplified registration with 14 suffix choices and one password field. The second sample produces its matching basketball result without a provider call or loading the example catalog.
- Production backend was deployed first, matched local source, retained all existing account IDs and names, and exposed the expected 14 suffixes with captcha enabled. Existing backup completed before deployment. No real emails or paid model calls were sent.
- Existing reviewed public catalog/provenance are unchanged. Two additional guest demonstrations reuse exact reviewed entries with bound content hashes; private review evidence stays outside the repository.
- Physical Android frame rate, haptic feel and mail inbox delivery were not tested in this patch. Native checks run in the normal signed Android CI.

Provider references: [NetEase](https://help.mail.yeah.net/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac2ba1b1228fd57ac92), [139](https://mail.10086.cn/), [189](https://help.189.cn/quickAccess/quickAccess.html), [Sina](https://mail.sina.com.cn/register/regmail.php), [Sohu](https://m.mail.sohu.com/app-web1/register.html), [CQU](https://net.cqu.edu.cn/info/1007/2194.htm). A supported email domain does not establish a verified real-world identity.
