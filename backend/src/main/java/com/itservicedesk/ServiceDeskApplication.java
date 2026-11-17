package com.itservicedesk;

import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ServiceDeskApplication {
    public static void main(String[] args) {
        // Keep JDBC startup independent of the host's time zone aliases.
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(ServiceDeskApplication.class, args);
    }
}
