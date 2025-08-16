package com.pelotoniq.cycling;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EnableJpaRepositories
public class CyclingApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(CyclingApiApplication.class, args);
    }
}