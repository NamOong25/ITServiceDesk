package com.itservicedesk.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AuthController {
    @GetMapping("/api/auth/csrf")
    CsrfToken csrf(CsrfToken token) {
        return token;
    }

    @GetMapping("/api/auth/me")
    Account me(Authentication authentication) {
        String role = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .filter(authority -> authority.startsWith("ROLE_"))
                .map(authority -> authority.substring("ROLE_".length()))
                .findFirst()
                .orElseThrow();
        return new Account(authentication.getName(), role);
    }

    @GetMapping("/api/workspaces/employee")
    Workspace employee() {
        return new Workspace("Cổng nhân viên");
    }

    @GetMapping("/api/workspaces/it")
    Workspace it() {
        return new Workspace("Hàng đợi IT");
    }

    @GetMapping("/api/workspaces/manager")
    Workspace manager() {
        return new Workspace("Cổng quản lý");
    }

    record Account(String email, String role) {}
    record Workspace(String title) {}
}
