package com.gyeongmae.auction.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "player")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Player {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tournament_id", nullable = false)
    private Tournament tournament;

    @Column(nullable = false)
    private String summonerName;

    private String name; // 실명(성명)

    private String tier;

    private String rankDivision;

    private int lp;

    private String mainPosition;

    private String subPosition;

    @Column(columnDefinition = "TEXT")
    private String mostChampions;

    @Column(nullable = false)
    @Builder.Default
    private Boolean isNewMember = false; // 신입회원 여부

    private Integer startingScore; // 경매 시작 지정 점수 (엑셀 파싱)

    @Column(columnDefinition = "TEXT")
    private String resolution; // 각오 한마디

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private PlayerStatus status = PlayerStatus.AVAILABLE;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id")
    private Team team;

    private Integer soldPrice;

    private String profileIconUrl;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    public enum PlayerStatus {
        AVAILABLE, AUCTIONING, SOLD, UNSOLD
    }
}
