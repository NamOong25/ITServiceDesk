package com.itservicedesk.auth;

import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@Profile("demo")
class DemoAccounts {
    @Bean
    ApplicationRunner seedDemoAccounts(JdbcClient db, PasswordEncoder encoder) {
        return args -> {
            add(db, encoder, "nhanvien@itsd.example", "EMPLOYEE");
            add(db, encoder, "it@itsd.example", "IT");
            add(db, encoder, "quanly@itsd.example", "MANAGER");
        };
    }

    private void add(JdbcClient db, PasswordEncoder encoder, String email, String role) {
        db.sql("""
                insert into app_user (email, password_hash, role, demo_account)
                values (:email, :password, :role, true)
                on conflict (email) do nothing
                """)
                .param("email", email)
                .param("password", encoder.encode("DemoItsd-2026!"))
                .param("role", role)
                .update();
    }
}
