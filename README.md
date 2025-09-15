# AWS Image Processing Pipeline

## Overview
This project is a serverless image processing pipeline built on AWS.  
It automatically optimizes and generates thumbnails for uploaded images, stores them in S3, and serves them securely through CloudFront.  

It also has monitoring with CloudWatch and error notifications via SNS.

## Architecture
- **S3** → Raw image uploads trigger processing.  
- **Lambda (image-processor)** → Resizes images (thumbnail + optimized).  
- **DynamoDB** → Stores metadata about each image.  
- **API Gateway + Lambda (image-api)** → Provides REST API to fetch image metadata.  
- **CloudFront** → CDN for caching and fast global delivery.  
- **SNS + CloudWatch** → Alerts when errors occur.  

flowchart LR
```mermaid
    subgraph Upload_Path["Upload & Processing"]
        U[User/Client] -- "PUT object\ns3://kaq-image-pipeline-project/raw/<file>" --> S3raw[(S3 Bucket\nraw/)]
        S3raw -- "S3 Event" --> Lproc[Lambda: image-processor]
        Lproc -->|Resize + write| S3pub[(S3 Bucket\npublic/thumbs & public/optimized)]
        Lproc -->|Write metadata| DDB[(DynamoDB\nImageMetadata)]
        Lproc -. "Errors/Logs" .-> CW[(CloudWatch Logs & Metrics)]
        CW -. "Alarm: Errors > 0" .-> SNS[(SNS Topic: image-pipeline-alerts)]
        SNS -. "Email Notification" .-> Mail[Your Email]
    end

    subgraph Read_API["Read API"]
        APIGW[API Gateway\nHTTP API] -- "GET /images\nGET /images/{id}" --> Lapi[Lambda: image-api]
        Lapi -->|Query| DDB
    end

    subgraph CDN_Path["Delivery"]
        CF[CloudFront\nDistribution] -- "GET /thumbs/<file>\nGET /optimized/<file>" --> S3pub
        Viewer[Browser/User] --> APIGW
        Viewer --> CF
    end

    classDef store fill:#eef,stroke:#6a8,stroke-width:1px,color:#111;
    classDef lambda fill:#ffe9cc,stroke:#d59a3b,color:#111;
    classDef service fill:#e8f4ff,stroke:#4b89dc,color:#111;

    class S3raw,S3pub,DDB store;
    class Lproc,Lapi lambda;
    class APIGW,CF,CW,SNS service;
```


## Services Used
- Amazon S3  
- AWS Lambda  
- Amazon DynamoDB  
- API Gateway  
- Amazon CloudFront  
- Amazon SNS  
- Amazon CloudWatch  

## Screenshots
- Check Screenshot Folder

## How to Use
1. Upload an image (PNG/JPG) to the S3 `raw/` folder.  
2. Lambda resizes and stores `public/thumbs/` and `public/optimized/`.  
3. Metadata is written to DynamoDB.  
4. Fetch metadata via API Gateway endpoint.  
5. Serve images globally via CloudFront domain.  

## License
This project is licensed under the MIT License – see the LICENSE file for details.
