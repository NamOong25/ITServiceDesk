package com.itservicedesk.auth;

import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@Profile("demo")
class DemoAccounts {
    @Bean
    @Order(0)
    ApplicationRunner seedDemoAccounts(JdbcClient db, PasswordEncoder encoder) {
        return args -> {
            add(db, encoder, "nhanvien@itsd.example", "EMPLOYEE");
            add(db, encoder, "it@itsd.example", "IT");
            add(db, encoder, "it2@itsd.example", "IT");
            add(db, encoder, "quanly@itsd.example", "MANAGER");
            db.sql("""
                    update app_user employee set manager_id = manager.id
                    from app_user manager
                    where employee.email = 'nhanvien@itsd.example' and employee.role = 'EMPLOYEE'
                        and employee.demo_account and employee.manager_id is null
                        and manager.email = 'quanly@itsd.example' and manager.role = 'MANAGER' and manager.demo_account
                    """).update();
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
