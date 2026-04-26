package com.gyeongmae.auction.websocket;

import com.gyeongmae.auction.dto.AuctionDto;
import com.gyeongmae.auction.service.AuctionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;

import org.springframework.stereotype.Controller;

@Controller
@RequiredArgsConstructor
@Slf4j
public class AuctionWebSocketController {

    private final AuctionService auctionService;

    @MessageMapping("/bid")
    public void handleBid(AuctionDto.BidRequest request) {
        try {
            auctionService.placeBid(request);
        } catch (Exception e) {
            log.error("Bid error: {}", e.getMessage());
            // Error is broadcast via the service layer or handled client-side
        }
    }

    @MessageMapping("/chat")
    public void handleChat(com.gyeongmae.auction.dto.ChatDto.MessageRequest request) {
        try {
            auctionService.handleChatMessage(request);
        } catch (Exception e) {
            log.error("Chat error: {}", e.getMessage());
        }
    }
}
