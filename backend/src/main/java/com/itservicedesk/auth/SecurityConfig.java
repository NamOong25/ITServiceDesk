package com.itservicedesk.auth;

import jakarta.servlet.DispatcherType;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

@Configuration
class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    UserDetailsService users(JdbcClient db, @Value("${itsd.demo.enabled:false}") boolean demoEnabled) {
        return email -> db.sql("""
                select email, password_hash, role from app_user
                where email = :email and (not demo_account or :demoEnabled)
                """)
                .param("email", email.strip().toLowerCase(Locale.ROOT))
                .param("demoEnabled", demoEnabled)
                .query((row, index) -> User.withUsername(row.getString("email"))
                        .password(row.getString("password_hash"))
                        .roles(row.getString("role"))
                        .build())
                .optional()
                .orElseThrow(() -> new UsernameNotFoundException("Account not found"));
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http) throws Exception {
        return http
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/api/auth/csrf").permitAll()
                        .requestMatchers("/api/workspaces/employee").hasRole("EMPLOYEE")
                        .requestMatchers("/api/incidents", "/api/incidents/**").hasRole("EMPLOYEE")
                        .requestMatchers("/api/workspaces/it").hasRole("IT")
                        .requestMatchers("/api/it/incidents", "/api/it/incidents/**").hasRole("IT")
                        .requestMatchers("/api/workspaces/manager", "/api/manager/overview").hasRole("MANAGER")
                        .requestMatchers(HttpMethod.GET, "/api/manager/incidents/*").hasRole("MANAGER")
                        .requestMatchers("/api/access-requests", "/api/access-requests/**").hasRole("EMPLOYEE")
                        .requestMatchers("/api/manager/access-requests", "/api/manager/access-requests/**").hasRole("MANAGER")
                        .requestMatchers("/api/it/access-requests", "/api/it/access-requests/**").hasRole("IT")
                        .requestMatchers(HttpMethod.GET, "/api/auth/me", "/api/notifications").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/notifications/*/read").authenticated()
                        .anyRequest().denyAll())
                .exceptionHandling(errors ->
                        errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .requestCache(cache -> cache.disable())
                .formLogin(login -> login
                        .loginPage("/")
                        .loginProcessingUrl("/api/auth/login")
                        .usernameParameter("email")
                        .successHandler((request, response, authentication) -> response.setStatus(204))
                        .failureHandler((request, response, error) ->
                                response.setStatus(error instanceof AuthenticationServiceException ? 503 : 401))
                        .permitAll())
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .deleteCookies("ITSDSESSION")
                        .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
                .build();
    }
}
